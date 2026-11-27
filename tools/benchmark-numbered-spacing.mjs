import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'

const batchStarted = performance.now()
const root = resolve(import.meta.dirname, '..')
const staffMode = process.argv.includes('--staff')
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const sourceRoot = resolve(argument('source-root') ?? join(root, 'src'))
const fontRoot = resolve(argument('font-root') ?? join(root, 'tools/fonts/library'))
const output = resolve(argument('output') ?? '.tmp/numbered-spacing/report.json')
const baselinePath = argument('baseline') ?? (process.argv.includes('--check') ? join(root, staffMode ? 'config/staff-spacing-baseline.json' : 'config/numbered-spacing-baseline.json') : undefined)
const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : undefined
const bundle = join(dirname(output), 'bundle'), origin = 'http://numbered-spacing.local'
mkdirSync(bundle, { recursive: true })
writeFileSync(join(bundle, 'entry.ts'), staffMode
  ? `export { initialize, searchSpacing as search } from ${JSON.stringify(join(root, 'tools/staff-width-layout.mjs'))};\n`
  : `export * from ${JSON.stringify(join(root, 'tools/numbered-spacing-layout.mjs'))};\n`)
execFileSync(process.execPath, [join(root, 'tools/build-numbered-audit-bundle.mjs'), bundle], { stdio: 'inherit' })
const scores = ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(sourceRoot, scope))
  .filter(file => file.endsWith('.m3n')).sort().map(file => `${scope}/${file}`))
  .filter(file => !argument('score') || file.includes(argument('score')))
assert(scores.length, 'No scores selected')
const rendererHash = createHash('sha256').update(readFileSync(join(bundle, 'bundle/bundle.js'))).digest('hex')
const auditLayout = process.argv.includes('--audit')
const prune = process.argv.includes('--prune')
const localRefine = process.argv.includes('--local-refine')
const numericLayout = process.argv.includes('--numeric-layout')
const avoidance = argument('avoidance') ?? 'element'
assert(['row', 'measure', 'element'].includes(avoidance), 'Invalid avoidance mode')
const measureAvoidance = process.argv.includes('--measure-avoidance')
const rowEnvelope = staffMode || measureAvoidance || process.argv.includes('--row-envelope')
const pageConstrainedBreaks = process.argv.includes('--page-bound') || rowEnvelope
const checkpoint = process.argv.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined
if (checkpoint) {
  assert.equal(checkpoint.notation ?? 'numbered', staffMode ? 'staff' : 'numbered', 'Cannot resume with a different notation')
  assert.equal(Boolean(checkpoint.numericLayout), numericLayout, 'Cannot resume with a different geometry engine')
  assert.equal(checkpoint.avoidance ?? 'element', avoidance, 'Cannot resume with a different avoidance granularity')
  assert.equal(Boolean(checkpoint.measureAvoidance), measureAvoidance, 'Cannot resume with a different avoidance mode')
  assert.equal(Boolean(checkpoint.rowEnvelope), rowEnvelope, 'Cannot resume with a different row-envelope setting')
  assert.equal(Boolean(checkpoint.pageConstrainedBreaks), pageConstrainedBreaks, 'Cannot resume with a different page-bound setting')
  assert.equal(checkpoint.sourceRoot, sourceRoot, 'Cannot resume against a different source root')
  assert.equal(checkpoint.rendererHash, rendererHash, 'Cannot resume after changing the renderer')
  assert.equal(checkpoint.auditLayout, auditLayout, 'Cannot resume with a different ink audit setting')
  assert.equal(checkpoint.prune, prune, 'Cannot resume with a different pruning setting')
  assert.equal(Boolean(checkpoint.localRefine), localRefine, 'Cannot resume with a different refinement setting')
  assert.equal(checkpoint.baselineRevision, baseline?.revision, 'Cannot resume against a different baseline')
}
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim()
const report = { notation: staffMode ? 'staff' : 'numbered', sourceRoot, sourceRevision, rendererHash, auditLayout, prune, localRefine, rowEnvelope, measureAvoidance, numericLayout, avoidance, pageConstrainedBreaks, baselineRevision: baseline?.revision, complete: false, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), entries: checkpoint?.entries ?? [] }
const save = () => { writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n'); renameSync(output + '.tmp', output) }
const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync)
const browser = await chromium.launch({ executablePath, headless: true,
  args: ['--disable-gpu', '--renderer-process-limit=1', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--expose-gc --max-old-space-size=256'] })
try {
  const page = await browser.newPage()
  if (process.argv.includes('--trace-widths')) page.on('console', message => console.log(message.text()))
  report.fontRoot = fontRoot
  const fonts = JSON.parse(readFileSync(join(fontRoot, 'manifest.json'), 'utf8')).fonts
  report.fontHashes = fonts.map(({ file, sha256 }) => ({ file, sha256 }))
  await page.route(`${origin}/**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><html style="font-synthesis:none"><body></body></html>' })
    if (path.startsWith('/fonts/')) {
      const font = fonts.find(font => path === '/fonts/' + font.file)
      if (!font) return route.abort()
      return route.fulfill({ path: join(fontRoot, font.file), contentType: 'font/ttf' })
    }
    return route.fulfill({ path: join(bundle, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
  })
  await page.goto(origin)
  await page.addScriptTag({ url: `${origin}/bundle.js` })
  const fontStarted = performance.now()
  await page.evaluate(fonts => m3n.initialize(fonts), fonts.map(font => ({ ...font, url: origin + '/fonts/' + font.file })))
  report.fontPreparationMs = performance.now() - fontStarted
  report.browserReuse = 'single-page-shared-fonts-and-metrics'
  await page.evaluate(enabled => { globalThis.__m3nTraceWidths = enabled }, process.argv.includes('--trace-widths'))
  for (const file of scores) {
    const source = readFileSync(join(sourceRoot, file), 'utf8')
    const sourceHash = createHash('sha256').update(source).digest('hex')
    const saved = report.entries.find(entry => entry.file === file)
    if (saved) { assert.equal(saved.sourceHash, sourceHash, `Source changed since checkpoint: ${file}`); continue }
    const profiling=Boolean(argument('cpu-profile')) && (!argument('profile-score') || file.includes(argument('profile-score')))
    const profiler=profiling ? await page.context().newCDPSession(page) : undefined
    if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start')}
    const result = await page.evaluate(({ source, audit, prune, localRefine, rowEnvelope, measureAvoidance, numericLayout, avoidance, pageConstrainedBreaks }) => m3n.search(source, audit, prune, localRefine, pageConstrainedBreaks, rowEnvelope, measureAvoidance, numericLayout, avoidance), { source, audit: auditLayout, prune, localRefine, rowEnvelope, measureAvoidance, numericLayout, avoidance, pageConstrainedBreaks })
    if(profiler) {
      const {profile}=await profiler.send('Profiler.stop')
      writeFileSync(resolve(argument('cpu-profile')),JSON.stringify(profile))
      await profiler.detach()
    }
    const previous = baseline?.entries.find(entry => entry.file === file)
    if (baseline) assert(previous && previous.sourceHash === sourceHash, `Baseline/source mismatch: ${file}`)
    const entry = { file, sourceHash, ...result, ...(previous ? { widthDelta: result.width - previous.width, pageDelta: result.pages - previous.pages } : {}) }
    report.entries.push(entry)
    save()
    console.log(`${report.entries.length}/${scores.length} ${file}: ${result.width}px / ${result.pages}p${previous ? ` (${entry.widthDelta >= 0 ? '+' : ''}${entry.widthDelta}px, ${entry.pageDelta}p)` : ''}`)
    // Release per-score layout graphs while preserving font and metric caches.
    await page.evaluate(() => { if (typeof globalThis.gc === 'function') globalThis.gc() })
  }
} finally { await browser.close() }
report.batchMs = performance.now() - batchStarted
report.searchMs = report.entries.reduce((sum, entry) => sum + entry.searchMs, 0)
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
