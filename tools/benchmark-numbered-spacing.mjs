import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = resolve(argument('output') ?? '.tmp/numbered-spacing/report.json')
const baselinePath = argument('baseline') ?? (process.argv.includes('--check') ? join(root, 'config/numbered-spacing-baseline.json') : undefined)
const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : undefined
const bundle = join(dirname(output), 'bundle'), origin = 'http://numbered-spacing.local'
mkdirSync(bundle, { recursive: true })
writeFileSync(join(bundle, 'entry.ts'), `export * from ${JSON.stringify(join(root, 'tools/numbered-spacing-layout.mjs'))};\n`)
execFileSync(process.execPath, [join(root, 'tools/build-numbered-audit-bundle.mjs'), bundle], { stdio: 'inherit' })
const scores = ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(root, 'src', scope))
  .filter(file => file.endsWith('.m3n')).sort().map(file => `${scope}/${file}`))
  .filter(file => !argument('score') || file.includes(argument('score')))
assert(scores.length, 'No scores selected')
const rendererHash = createHash('sha256').update(readFileSync(join(bundle, 'bundle/bundle.js'))).digest('hex')
const auditLayout = process.argv.includes('--audit')
const checkpoint = process.argv.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined
if (checkpoint) {
  assert.equal(checkpoint.rendererHash, rendererHash, 'Cannot resume after changing the renderer')
  assert.equal(checkpoint.auditLayout, auditLayout, 'Cannot resume with a different ink audit setting')
  assert.equal(checkpoint.baselineRevision, baseline?.revision, 'Cannot resume against a different baseline')
}
const report = { rendererHash, auditLayout, baselineRevision: baseline?.revision, complete: false, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), entries: checkpoint?.entries ?? [] }
const save = () => { writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n'); renameSync(output + '.tmp', output) }
const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync)
for (const file of scores) {
  const source = readFileSync(join(root, 'src', file), 'utf8')
  const sourceHash = createHash('sha256').update(source).digest('hex')
  const saved = report.entries.find(entry => entry.file === file)
  if (saved) { assert.equal(saved.sourceHash, sourceHash, `Source changed since checkpoint: ${file}`); continue }
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--disable-gpu', '--renderer-process-limit=1', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--max-old-space-size=256'] })
  try {
    const page = await browser.newPage()
    await page.route(`${origin}/**`, route => new URL(route.request().url()).pathname === '/'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><html style="font-synthesis:none"><body></body></html>' })
      : route.fulfill({ path: join(bundle, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' }))
    await page.goto(origin)
    await page.addScriptTag({ url: `${origin}/bundle.js` })
    const result = await page.evaluate(({ source, audit }) => m3n.search(source, audit), { source, audit: auditLayout })
    const previous = baseline?.entries.find(entry => entry.file === file)
    if (baseline) assert(previous && previous.sourceHash === sourceHash, `Baseline/source mismatch: ${file}`)
    const entry = { file, sourceHash, ...result, ...(previous ? { widthDelta: result.width - previous.width, pageDelta: result.pages - previous.pages } : {}) }
    report.entries.push(entry)
    save()
    console.log(`${report.entries.length}/${scores.length} ${file}: ${result.width}px / ${result.pages}p${previous ? ` (${entry.widthDelta >= 0 ? '+' : ''}${entry.widthDelta}px, ${entry.pageDelta}p)` : ''}`)
  } finally { await browser.close() }
}
report.complete = true
save()
if (baseline) {
  report.summary = { scores: report.entries.length,
    samePages: report.entries.filter(e => e.pageDelta === 0).length,
    sameWidth: report.entries.filter(e => e.widthDelta === 0).length,
    withinOneWidthLevel: report.entries.filter(e => Math.abs(e.widthDelta) <= 24).length,
    maxWidthDelta: Math.max(...report.entries.map(e => Math.abs(e.widthDelta))),
    outside: report.entries.reduce((n, e) => n + e.outside.length, 0),
    overlaps: report.entries.reduce((n, e) => n + e.overlaps.length, 0) }
  save()
  console.log(JSON.stringify(report.summary))
  if (process.argv.includes('--check')) {
    assert.equal(report.summary.samePages, report.summary.scores, 'Numbered optimal page counts changed')
    assert(report.summary.withinOneWidthLevel / report.summary.scores >= .95, 'Over 5% of numbered optimal widths moved more than 24px')
    assert(report.summary.maxWidthDelta <= 48, 'A numbered optimal width moved more than 48px')
    assert.equal(report.summary.outside + report.summary.overlaps, 0, 'Layout ink audit failed')
  }
}
