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
// Package exports resolve dist/. Always rebuild before bundling so a source
// experiment cannot silently benchmark yesterday's implementation.
execFileSync('npm', ['run', 'build:packages'], { cwd: root, stdio: 'inherit' })
const bundleFlags = ['--external-fonts', '--minify'].filter(flag => process.argv.includes(flag))
execFileSync(process.execPath, [join(root, 'tools/build-numbered-audit-bundle.mjs'), bundle, ...bundleFlags], { stdio: 'inherit' })
const scores = ['scores', 'works', 'examples'].flatMap(scope => readdirSync(join(sourceRoot, scope))
  .filter(file => file.endsWith('.m3n')).sort().map(file => `${scope}/${file}`))
  .filter(file => !argument('score') || file.includes(argument('score')))
assert(scores.length, 'No scores selected')
const rendererHash = createHash('sha256').update(readFileSync(join(bundle, 'bundle/bundle.js'))).digest('hex')
const productionPolicy=process.argv.includes('--production-policy')
const auditLayout = process.argv.includes('--audit')
const prune = process.argv.includes('--prune')
const experimentalInkBin = Number(argument('proxy-bin') ?? 0)
const experimentalWidthBin = Number(argument('proxy-width-bin') ?? 0)
const experimentalPageCostPasses=Number(argument('page-cost-passes') ?? 0)
assert(Number.isInteger(experimentalPageCostPasses) && experimentalPageCostPasses>=0 && experimentalPageCostPasses<=16,'Invalid page cost pass budget')
assert(Number.isInteger(experimentalWidthBin) && experimentalWidthBin>=0 && experimentalWidthBin<=48 && experimentalWidthBin%6===0, 'Invalid proxy width bin')
assert(Number.isInteger(experimentalInkBin) && experimentalInkBin >= 0 && experimentalInkBin <= 48, 'Invalid proxy bin')
const experimentalRowReuse = process.argv.includes('--row-reuse')
const experimentalGreedyCeiling = process.argv.includes('--fast-ceiling')
assert(!process.argv.includes('--endpoint-floor') || experimentalRowReuse, '--endpoint-floor requires --row-reuse')
assert(!process.argv.includes('--single-tier') || experimentalRowReuse, '--single-tier requires --row-reuse')
assert(!process.argv.includes('--equal-tier') || experimentalRowReuse, '--equal-tier requires --row-reuse')
assert(!process.argv.includes('--cross-tier') || experimentalRowReuse, '--cross-tier requires --row-reuse')
assert(!auditLayout || !experimentalRowReuse, 'Surrogate candidates cannot be painted; audit exact widths without --row-reuse')
assert(!experimentalInkBin || experimentalRowReuse, '--proxy-bin requires --row-reuse')
assert(!experimentalWidthBin || experimentalRowReuse, '--proxy-width-bin requires --row-reuse')
assert(!experimentalPageCostPasses || experimentalRowReuse, '--page-cost-passes requires --row-reuse')
assert(!experimentalGreedyCeiling || experimentalRowReuse, '--fast-ceiling requires --row-reuse for final exact verification')
assert(!productionPolicy || !auditLayout && !experimentalRowReuse && !experimentalInkBin && !experimentalWidthBin && !experimentalPageCostPasses && !experimentalGreedyCeiling && !process.argv.includes('--single-tier') && !process.argv.includes('--equal-tier') && !process.argv.includes('--endpoint-floor') && !process.argv.includes('--cross-tier'),'Production policy cannot be combined with separate experimental settings or SVG audit')
const coldEachScore=process.argv.includes('--cold-each-score')
const warmupIterations = Number(argument('warmup') ?? 0)
assert(Number.isInteger(warmupIterations) && warmupIterations >= 0 && warmupIterations <= 10, 'Invalid warmup count')
assert(!coldEachScore || !warmupIterations,'Cold-per-score audit cannot warm up scores')
const numericLayout = process.argv.includes('--numeric-layout')
const pageConstrainedBreaks = process.argv.includes('--page-bound')
const checkpoint = process.argv.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined
if (checkpoint) {
  assert.equal(Boolean(checkpoint.productionPolicy),productionPolicy,'Cannot resume with a different production policy')
  assert.equal(checkpoint.notation ?? 'numbered', staffMode ? 'staff' : 'numbered', 'Cannot resume with a different notation')
  assert.equal(Boolean(checkpoint.numericLayout), numericLayout, 'Cannot resume with a different geometry engine')
  assert.equal(Boolean(checkpoint.pageConstrainedBreaks), pageConstrainedBreaks, 'Cannot resume with a different page-bound setting')
  assert.equal(checkpoint.sourceRoot, sourceRoot, 'Cannot resume against a different source root')
  assert.equal(checkpoint.rendererHash, rendererHash, 'Cannot resume after changing the renderer')
  assert.equal(checkpoint.auditLayout, auditLayout, 'Cannot resume with a different ink audit setting')
  assert.equal(checkpoint.prune, prune, 'Cannot resume with a different pruning setting')
  assert.equal(checkpoint.experimentalInkBin ?? 0, experimentalInkBin, 'Cannot resume with different ink bins')
  assert.equal(checkpoint.experimentalWidthBin ?? 0, experimentalWidthBin, 'Cannot resume with different geometry width bins')
  assert.equal(checkpoint.experimentalPageCostPasses ?? 0, experimentalPageCostPasses, 'Cannot resume with a different page cost pass budget')
  assert.equal(Boolean(checkpoint.experimentalRowReuse), experimentalRowReuse, 'Cannot resume with different row reuse')
  assert.equal(Boolean(checkpoint.experimentalEndpointFloor),process.argv.includes('--endpoint-floor'),'Cannot resume with a different endpoint page floor')
  assert.equal(Boolean(checkpoint.experimentalSingleTier),process.argv.includes('--single-tier'),'Cannot resume with a different single-tier surrogate')
  assert.equal(Boolean(checkpoint.experimentalEqualTier),process.argv.includes('--equal-tier'),'Cannot resume with a different equal-measure tier surrogate')
  assert.equal(Boolean(checkpoint.experimentalTierReuse), process.argv.includes('--cross-tier'), 'Cannot resume with different tier reuse')
  assert.equal(Boolean(checkpoint.experimentalGreedyCeiling), experimentalGreedyCeiling, 'Cannot resume with different ceiling solving')
  assert.equal(checkpoint.warmupIterations ?? 0, warmupIterations, 'Cannot resume with a different warmup count')
  assert.equal(Boolean(checkpoint.coldEachScore),coldEachScore,'Cannot resume with a different browser reuse policy')
  assert.equal(Boolean(checkpoint.detailedTimings), auditLayout || process.argv.includes('--detailed-timings'), 'Cannot resume with different timing collection')
  assert.equal(checkpoint.baselineRevision, baseline?.revision, 'Cannot resume against a different baseline')
}
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim()
const report = { notation: staffMode ? 'staff' : 'numbered', sourceRoot, sourceRevision, rendererHash, auditLayout, prune, numericLayout, pageConstrainedBreaks, baselineRevision: baseline?.revision, complete: false, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), entries: checkpoint?.entries ?? [] }
report.bundleFlags = bundleFlags
report.detailedTimings = auditLayout || process.argv.includes('--detailed-timings')
if (experimentalInkBin) report.experimentalInkBin = experimentalInkBin
if (experimentalWidthBin) report.experimentalWidthBin = experimentalWidthBin
report.experimentalPageCostPasses = experimentalPageCostPasses
report.productionPolicy=productionPolicy
report.experimentalEndpointFloor=process.argv.includes('--endpoint-floor')
report.experimentalSingleTier=process.argv.includes('--single-tier')
report.experimentalEqualTier=process.argv.includes('--equal-tier')
if(coldEachScore)report.coldEachScore=true
report.browserReuse=coldEachScore ? 'fresh-browser-per-score' : 'single-page-shared-fonts-and-metrics'
report.fontPreparationMs=checkpoint?.fontPreparationMs ?? 0
if (experimentalRowReuse) report.experimentalRowReuse = true
if (process.argv.includes('--cross-tier')) report.experimentalTierReuse = true
if (experimentalGreedyCeiling) report.experimentalGreedyCeiling = true
if (warmupIterations) report.warmupIterations = warmupIterations
const save = () => { writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n'); renameSync(output + '.tmp', output) }
const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync)
report.fontRoot = fontRoot
const fonts = JSON.parse(readFileSync(join(fontRoot, 'manifest.json'), 'utf8')).fonts
report.fontHashes = fonts.map(({ file, sha256 }) => ({ file, sha256 }))
if(checkpoint)assert.deepEqual(checkpoint.fontHashes,report.fontHashes,'Cannot resume with different font inputs')
let browser, page, latestFontPreparationMs
const openBrowser=async()=>{
  browser = await chromium.launch({ executablePath, headless: true,
  args: ['--disable-gpu', '--renderer-process-limit=1', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--expose-gc --max-old-space-size=256'] })
  page = await browser.newPage()
  if (process.argv.includes('--trace-widths')) page.on('console', message => console.log(message.text()))
  await page.route(`${origin}/**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><html style="font-synthesis:none"><body></body></html>' })
    if (path.startsWith('/audit-assets/')) {
      const asset = join(bundle, 'bundle', path.slice(1))
      if (!existsSync(asset)) return route.abort()
      return route.fulfill({ path: asset, contentType: path.endsWith('.woff2') ? 'font/woff2' : 'font/ttf' })
    }
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
  latestFontPreparationMs = performance.now() - fontStarted
  report.fontPreparationMs=(report.fontPreparationMs ?? 0)+latestFontPreparationMs
  await page.evaluate(enabled=>{globalThis.__m3nProductionWidthPolicy=enabled},productionPolicy)
  await page.evaluate(enabled => { globalThis.__m3nTraceWidths = enabled }, process.argv.includes('--trace-widths'))
  await page.evaluate(enabled => { globalThis.__m3nExperimentalRowReuse = enabled }, process.argv.includes('--row-reuse'))
  await page.evaluate(enabled => { globalThis.__m3nExperimentalGreedyCeiling = enabled }, process.argv.includes('--fast-ceiling'))
  await page.evaluate(size => { globalThis.__m3nExperimentalInkBin = size }, experimentalInkBin)
  await page.evaluate(size => { globalThis.__m3nExperimentalWidthBin = size }, experimentalWidthBin)
  await page.evaluate(passes => { globalThis.__m3nExperimentalPageCostPasses = passes }, experimentalPageCostPasses)
  await page.evaluate(enabled => { globalThis.__m3nExperimentalTierReuse = enabled }, process.argv.includes('--cross-tier'))
  await page.evaluate(enabled=>{globalThis.__m3nExperimentalEndpointFloor=enabled},process.argv.includes('--endpoint-floor'))
  await page.evaluate(enabled=>{globalThis.__m3nExperimentalSingleTier=enabled},process.argv.includes('--single-tier'))
  await page.evaluate(enabled=>{globalThis.__m3nExperimentalEqualTier=enabled},process.argv.includes('--equal-tier'))
  await page.evaluate(enabled => { globalThis.__m3nDetailedLayoutTimings = enabled }, process.argv.includes('--detailed-timings'))
}
try {
  for (const file of scores) {
    const source = readFileSync(join(sourceRoot, file), 'utf8')
    const sourceHash = createHash('sha256').update(source).digest('hex')
    const saved = report.entries.find(entry => entry.file === file)
    if (saved) { assert.equal(saved.sourceHash, sourceHash, `Source changed since checkpoint: ${file}`); continue }
    if(!page || coldEachScore){await browser?.close();await openBrowser()}
    for (let iteration = 0; iteration < warmupIterations; iteration++) {
      await page.evaluate(async ({ source, prune, numericLayout, pageConstrainedBreaks }) => {
        await m3n.search(source, false, prune, pageConstrainedBreaks, numericLayout)
        if (typeof globalThis.gc === 'function') globalThis.gc()
      }, { source, prune, numericLayout, pageConstrainedBreaks })
    }
    const profiling=Boolean(argument('cpu-profile')) && (!argument('profile-score') || file.includes(argument('profile-score')))
    const profiler=profiling ? await page.context().newCDPSession(page) : undefined
    if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start')}
    const result = await page.evaluate(({ source, audit, prune, numericLayout, pageConstrainedBreaks }) => m3n.search(source, audit, prune, pageConstrainedBreaks, numericLayout), { source, audit: auditLayout, prune, numericLayout, pageConstrainedBreaks })
    if(profiler) {
      const {profile}=await profiler.send('Profiler.stop')
      writeFileSync(resolve(argument('cpu-profile')),JSON.stringify(profile))
      await profiler.detach()
    }
    const previous = baseline?.entries.find(entry => entry.file === file)
    if (baseline) assert(previous && previous.sourceHash === sourceHash, `Baseline/source mismatch: ${file}`)
    const entry = { file, sourceHash, ...result, ...(coldEachScore ? {fontPreparationMs:latestFontPreparationMs} : {}), ...(previous ? { widthDelta: result.width - previous.width, pageDelta: result.pages - previous.pages } : {}) }
    report.entries.push(entry)
    save()
    console.log(`${report.entries.length}/${scores.length} ${file}: ${result.width}px / ${result.pages}p${previous ? ` (${entry.widthDelta >= 0 ? '+' : ''}${entry.widthDelta}px, ${entry.pageDelta}p)` : ''}`)
    // Release per-score layout graphs while preserving font and metric caches.
    await page.evaluate(() => { if (typeof globalThis.gc === 'function') globalThis.gc() })
  }
} finally { await browser?.close() }
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
