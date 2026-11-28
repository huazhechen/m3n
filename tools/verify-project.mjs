import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const browserTests = ['native-ink-collisions', 'online-scorebook-parity', 'scorebook-notation', 'scorebook-pdf']
const mode = process.argv[2] ?? 'full'
if (!['full', 'ci', 'tools', 'browser', 'e2e', 'integration'].includes(mode)) throw new Error(`Unknown verification mode: ${mode}`)

const started = performance.now()
const stages = []
let complete = false
process.on('exit', code => {
  const seconds = (performance.now() - started) / 1000
  mkdirSync(resolve(root, '.tmp'), { recursive: true })
  writeFileSync(resolve(root, `.tmp/verification-${mode}.json`), JSON.stringify({
    mode, complete, code, seconds, targetSeconds: 120, withinTarget: seconds < 120, stages,
  }, null, 2) + '\n')
  console.log(`[verify] ${mode}: ${seconds.toFixed(2)}s (${seconds < 120 ? 'within' : 'over'} 120s target)`)
})

function run(command, args, env = {}, capture = false) {
  console.log(`\n[verify] ${command} ${args.join(' ')}`)
  const before = performance.now()
  const result = spawnSync(command, args, { cwd: root, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 })
  const seconds = (performance.now() - before) / 1000
  stages.push({ command: [command, ...args].join(' '), seconds, code: result.status })
  console.log(`[verify] stage: ${seconds.toFixed(2)}s`)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout
}
const npm = (script, args = [], env) => run('npm', ['run', script, ...args], env)
const nodeTests = files => run(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files])

function integrationChecks() {
  nodeTests(['tools/svg-ink-bounds.test.mjs'])
  npm('test:scorebook:browser')
  run(process.execPath, ['tools/compare-notation-density.mjs', '--regression'])
  npm('test:pdf-font:full')
  run(process.execPath, [import.meta.filename, 'e2e'], { M3N_E2E_SKIP_BUILD: '1' })
}

if (mode === 'tools') {
  // Discover new offline tool regressions automatically; browser and full-font
  // checks have explicit, serial phases so they cannot overlap generation.
  nodeTests(readdirSync(resolve(root, 'tools')).filter(file => /\.test\.(mjs|mts)$/.test(file)
    && ![...browserTests, 'svg-ink-bounds', 'builtin-pdf-font'].some(name => file === `${name}.test.mjs`))
    .sort().map(file => `tools/${file}`))
} else if (mode === 'browser') {
  nodeTests(browserTests.map(name => `tools/${name}.test.mjs`))
} else if (mode === 'e2e') {
  const env = { M3N_E2E_SKIP_BUILD: '1', M3N_E2E_LOW_MEMORY: '1' }
  const port = process.env.M3N_E2E_PORT ?? '4173'
  if (process.env.M3N_E2E_SKIP_BUILD !== '1') {
    npm('build', ['--', '--outDir', `.tmp/playwright-dist-${port}`], { VITE_BASE_URL: '/', VITE_SUBMIT_MODE: 'local' })
  }
  const playwright = (args, capture = false) => run(process.execPath,
    [fileURLToPath(import.meta.resolve('@playwright/test/cli')), 'test', ...args], env, capture)
  // Recycle the worker/browser between files to release native font caches.
  for (const file of readdirSync(resolve(root, 'tests/e2e')).filter(file => file.endsWith('.spec.ts')).sort()) {
    const path = `tests/e2e/${file}`
    if (file.startsWith('staff-')) {
      // Staff export/engraving cases also retain large native font caches
      // within a single file. List source locations without starting a server.
      const listing = JSON.parse(playwright([path, '--list', '--reporter=json'], true))
      const lines = new Set()
      const visit = suite => {
        for (const spec of suite.specs ?? []) lines.add(spec.line)
        for (const child of suite.suites ?? []) visit(child)
      }
      visit(listing)
      if (!lines.size || listing.errors?.length) throw new Error(`Cannot list E2E cases: ${path}`)
      for (const line of lines) playwright([`${path}:${line}`, '--workers=1'])
    } else playwright([path, '--workers=1'])
  }
} else if (mode === 'integration') {
  const port = process.env.M3N_E2E_PORT ?? '4173'
  if (process.env.M3N_E2E_SKIP_BUILD !== '1') {
    npm('build', ['--', '--outDir', `.tmp/playwright-dist-${port}`], { VITE_BASE_URL: '/', VITE_SUBMIT_MODE: 'local' })
  }
  integrationChecks()
} else if (mode === 'ci') {
  npm('build:packages')
  nodeTests(['tools/score-artifacts.test.mjs', 'tools/chromium-options.test.mjs', 'tools/density-regression.test.mjs'])
  npm('check:score-artifacts')
  nodeTests(['tools/native-ink-collisions.test.mjs'])
  run(process.execPath, ['tools/compare-notation-density.mjs', '--regression'])
} else {
  npm('check:boundaries')
  npm('lint')
  npm('test')
  npm('check:score-artifacts')
  const port = process.env.M3N_E2E_PORT ?? '4173'
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'])
  run(process.execPath, ['tools/build-web.mjs', '--outDir', `.tmp/playwright-dist-${port}`], { VITE_BASE_URL: '/', VITE_SUBMIT_MODE: 'local' })
  integrationChecks()
}

complete = true
