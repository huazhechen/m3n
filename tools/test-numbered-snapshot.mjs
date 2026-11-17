import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'

// Build workspace dependencies from the same sources as the tests. The editor
// remains live; the manifest makes later changes explicit instead of mixing a
// new native module with an old jpFun dist halfway through a long test run.
const root = resolve(import.meta.dirname, '..')
const output = join(root, '.tmp/numbered-tests', `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`)
const workspace = join(output, 'workspace')
const packages = ['jpfun', 'notation', 'numbered-notation']
const inputPaths = ['package.json', 'tsconfig.package.json', ...packages.map(pkg => `packages/${pkg}`), 'src/scores', 'src/examples']
const files = process.argv.slice(2).map(argument => {
  if (!argument.startsWith('--file=') || !/^src\/[\w./-]+\.test\.ts$/.test(argument.slice(7)) || argument.includes('..')) {
    throw new Error(`Expected --file=src/name.test.ts, received ${argument}`)
  }
  return argument.slice(7)
})
const hashes = {}
const excluded = path => ['node_modules', 'dist'].includes(path.split('/').at(-1)) || path.endsWith('.tsbuildinfo')
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const record = (file, base, target) => {
  if (excluded(file)) return
  if (statSync(file).isDirectory()) for (const entry of readdirSync(file)) record(join(file, entry), base, target)
  else target[relative(base, file)] = hash(file)
}
mkdirSync(workspace, { recursive: true })
for (const path of inputPaths) {
  const target = join(workspace, path)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(join(root, path), target, { recursive: true,
    filter: source => !excluded(source) })
}
record(workspace, workspace, hashes)
const modules = join(workspace, 'node_modules')
mkdirSync(join(modules, '@m3n'), { recursive: true })
for (const entry of readdirSync(join(root, 'node_modules'))) {
  if (entry.startsWith('.') || entry === '@m3n') continue
  symlinkSync(join(root, 'node_modules', entry), join(modules, entry))
}
for (const pkg of packages) symlinkSync(join(workspace, 'packages', pkg), join(modules, '@m3n', pkg))
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ files, hashes }, null, 2))
const status = { complete: false, passed: false, steps: [], changedSinceSnapshot: [] }
const save = () => writeFileSync(join(output, 'run-status.json'), JSON.stringify(status, null, 2))
save()
console.log(`Snapshot and logs: ${output}`)
async function run(name, executable, args, cwd) {
  const log = createWriteStream(join(output, `${name}.log`))
  const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  }).finally(() => log.end())
  status.steps.push({ name, ...result }); save()
  console.log(`${name}: ${result.signal ?? result.code}`)
  return result.code === 0
}
try {
  let passed = true
  for (const pkg of packages) {
    if (!await run(`build-${pkg}`, process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], join(workspace, 'packages', pkg))) {
      passed = false; break
    }
    const entry = pkg === 'jpfun' ? 'core' : 'index'
    for (const extension of ['js', 'd.ts']) if (!existsSync(join(workspace, 'packages', pkg, 'dist', `${entry}.${extension}`))) {
      throw new Error(`Fresh ${pkg} build did not emit ${entry}.${extension}; refusing workspace fallback`)
    }
  }
  if (passed) passed = await run('tests', process.execPath,
    [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.config.ts', '--maxWorkers=1', ...files],
    join(workspace, 'packages/numbered-notation'))
  status.complete = true; status.passed = passed
  process.exitCode = passed ? 0 : 1
} catch (error) {
  status.error = String(error); process.exitCode = 1
} finally {
  const current = {}
  for (const path of inputPaths) {
    try { record(join(root, path), root, current) } catch (error) { status.freshnessError = String(error) }
  }
  status.changedSinceSnapshot = [...new Set([...Object.keys(hashes), ...Object.keys(current)])]
    .filter(path => hashes[path] !== current[path])
  save()
  console.log(JSON.stringify({ ...status, report: output }))
}
