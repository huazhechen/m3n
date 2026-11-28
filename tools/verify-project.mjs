import { readdirSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const browserTests = ['native-ink-collisions', 'online-scorebook-parity', 'scorebook-notation', 'scorebook-pdf']
const mode = process.argv[2] ?? 'full'
if (!['full', 'ci', 'tools', 'browser', 'e2e', 'integration', 'non-e2e'].includes(mode)) throw new Error(`Unknown verification mode: ${mode}`)

const target = ['full', 'integration'].includes(mode) ? 240 : 120
const started = performance.now()
const stages = []
let complete = false
const reportPath = resolve(root, `.tmp/verification-${mode}.json`)
mkdirSync(resolve(root, '.tmp'), { recursive: true })
function report(code) {
  const seconds = (performance.now() - started) / 1000
  writeFileSync(reportPath, JSON.stringify({
    mode, complete, code, seconds, targetSeconds: target, withinTarget: seconds < target, stages,
  }, null, 2) + '\n')
  return seconds
}
// An interrupted process must not leave the previous successful report behind.
report(null)
process.on('exit', code => {
  const seconds = report(code)
  console.log(`[verify] ${mode}: ${seconds.toFixed(2)}s (${seconds < target ? 'within' : 'over'} ${target}s target)`)
})

function run(command, args, env = {}) {
  console.log(`\n[verify] ${command} ${args.join(' ')}`)
  const before = performance.now()
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit',
    encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 })
  const seconds = (performance.now() - before) / 1000
  stages.push({ command: [command, ...args].join(' '), seconds, code: result.status })
  console.log(`[verify] stage: ${seconds.toFixed(2)}s`)
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    throw new Error(`Verification stage failed: ${command} ${args.join(' ')}`)
  }
}
const npm = (script, args = [], env) => run('npm', ['run', script, ...args], env)
const nodeTests = (files, isolate = true) => run(process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...(isolate ? [] : ['--experimental-test-isolation=none']), ...files])

function integrationChecks() {
  npm('test:scorebook:browser')
  run(process.execPath, ['tools/compare-notation-density.mjs', '--regression'])
}

if (mode === 'tools') {
  // Discover offline tool regressions automatically. Browser and PDF-font
  // checks have separate serial stages so they cannot overlap generation.
  nodeTests(readdirSync(resolve(root, 'tools')).filter(file => /\.test\.(mjs|mts)$/.test(file)
    && ![...browserTests, 'builtin-pdf-font'].some(name => file === `${name}.test.mjs`))
    .sort().map(file => `tools/${file}`), false)
} else if (mode === 'browser') {
  // One freshly generated fixture font per invocation, shared serially by the
  // browser bundle workers. No prior-run cache participates in verification.
  const fontDirectory = mkdtempSync(join(tmpdir(), 'm3n-browser-font-'))
  process.env.M3N_BROWSER_FIXTURE_FONT_DIR = fontDirectory
  try { nodeTests(browserTests.map(name => `tools/${name}.test.mjs`)) }
  finally { rmSync(fontDirectory, { recursive: true, force: true }) }
} else if (mode === 'e2e') {
  const env = { M3N_E2E_SKIP_BUILD: '1', M3N_E2E_LOW_MEMORY: '1' }
  const port = process.env.M3N_E2E_PORT ?? '4173'
  if (process.env.M3N_E2E_SKIP_BUILD !== '1') {
    const buildEnv = { VITE_BASE_URL: '/', VITE_SUBMIT_MODE: 'local' }
    if (process.env.M3N_E2E_PACKAGES_READY === '1') {
      run(process.execPath, ['tools/build-web.mjs', '--outDir', `.tmp/playwright-dist-${port}`], buildEnv)
    } else npm('build', ['--', '--outDir', `.tmp/playwright-dist-${port}`], buildEnv)
  }
  const playwright = args => run(process.execPath,
    [fileURLToPath(import.meta.resolve('@playwright/test/cli')), 'test', ...args], env)
  // Release native font caches after each small scenario group.
  for (const file of readdirSync(resolve(root, 'tests/e2e')).filter(file => file.endsWith('.spec.ts')).sort()) {
    playwright([`tests/e2e/${file}`, '--workers=1'])
  }
} else if (mode === 'integration') {
  const port = process.env.M3N_E2E_PORT ?? '4173'
  if (process.env.M3N_E2E_SKIP_BUILD !== '1') {
    npm('build', ['--', '--outDir', `.tmp/playwright-dist-${port}`], { VITE_BASE_URL: '/', VITE_SUBMIT_MODE: 'local' })
  }
  integrationChecks()
  run(process.execPath, [import.meta.filename, 'e2e'], { M3N_E2E_SKIP_BUILD: '1' })
} else if (mode === 'ci') {
  npm('build:packages')
  nodeTests(['tools/score-artifacts.test.mjs', 'tools/chromium-options.test.mjs', 'tools/density-regression.test.mjs'])
  npm('check:score-artifacts')
  nodeTests(['tools/native-ink-collisions.test.mjs'])
  run(process.execPath, ['tools/compare-notation-density.mjs', '--regression'])
} else if (mode === 'full') {
  run(process.execPath, [import.meta.filename, 'non-e2e'])
  run(process.execPath, [import.meta.filename, 'e2e'], { M3N_E2E_SKIP_BUILD: '0', M3N_E2E_PACKAGES_READY: '1' })
} else {
  npm('check:boundaries')
  npm('lint')
  npm('test')
  npm('check:score-artifacts')
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'])
  integrationChecks()
}

if ((performance.now() - started) / 1000 >= target) {
  console.error(`[verify] ${mode} exceeded the ${target}s budget`)
  process.exit(1)
}
complete = true
