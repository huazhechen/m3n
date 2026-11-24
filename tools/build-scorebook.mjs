import { prepareBuiltinPdfFont } from './prepare-builtin-pdf-font.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { availableParallelism, cpus } from 'node:os'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { chooseBestWidth, probeWidthCandidates, widthSearchStrategy, widthMinimum, widthMaximum, widthStep } from './scorebook-width.mjs'
import { summarizeMeasurements } from './lib/scorebook-timing.mjs'
import { optimizeScorebook, optimizeScorebookWithRefinement, packingPolicy, sharedScoreGap, sharedPreferredWidth, sharedWidthMaximum } from './scorebook-packing.mjs'

const runStarted = performance.now(), stages = {}
let phaseStarted = runStarted
const endPhase = name => { const now = performance.now(); stages[name] = now - phaseStarted; phaseStarted = now }
const root = resolve(import.meta.dirname, '..'), output = join(root, 'scorebook')
const planFile = resolve(process.argv.find(arg => arg.startsWith('--plan='))?.slice(7) ?? join(root, 'config/scorebook/editorial-plan.json'))
const probeOnly = process.argv.includes('--probe-only')
const auditLayout = process.argv.includes('--audit-layout')
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
assert(!process.argv.includes('--retain-unchanged-sizes'), 'Every build now selects widths from the web renderer; remove --retain-unchanged-sizes')
const temp = join(root, '.tmp', plan.outputKey), profile = plan.page
const hash = data => createHash('sha256').update(data).digest('hex')
const sourceFiles = readdirSync(join(root, 'src/scores')).filter(file => file.endsWith('.m3n')).sort()
assert.deepEqual(plan.entries.map(entry => entry.file).sort(), sourceFiles, 'Include every score exactly once')
assert.equal(new Set(plan.entries.map(entry => entry.id)).size, plan.entries.length)
mkdirSync(join(temp, 'pages'), { recursive: true })
await build({ configFile: false, logLevel: 'error', define: { 'import.meta.url': JSON.stringify('http://scorebook.local/bundle.js') }, build: {
  outDir: join(temp, 'bundle'), emptyOutDir: true, minify: false,
  lib: { entry: join(root, 'tools/scorebook-layout.mjs'), name: 'scorebook', formats: ['iife'], fileName: () => 'bundle.js' },
} })
endPhase('bundleMs')
prepareBuiltinPdfFont()
endPhase('pdfFontMs')
const font = readFileSync(join(root, '.tmp/scorebook-font/text.ttf'))
const rendererSha256 = createHash('sha256').update(readFileSync(join(temp, 'bundle/bundle.js'))).update(font).digest('hex')
// Reorder or regroup a validated edition without repeating identical width probes.
const reuseFile = process.argv.find(arg => arg.startsWith('--reuse-widths='))?.slice(15)
const forceMeasure = process.argv.includes('--force-measure')
assert(!(reuseFile && forceMeasure), 'Choose either --reuse-widths or --force-measure')
const reused = reuseFile ? JSON.parse(readFileSync(resolve(reuseFile), 'utf8')) : undefined
if (reused) assert.equal(reused.auditLayout, auditLayout, 'Reused measurements must match the audit mode')
if (reused) assert.equal(reused.rendererSha256, rendererSha256, 'Cached width probes must match the renderer and fonts')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const text = (value, x, y, size = 16, attrs = '') => `<text x="${x}" y="${y}" font-size="${size}" font-family="Barlow Semi Condensed, Bravura, Noto Sans SC" ${attrs}>${escape(value)}</text>`
const pageSvg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 ${profile.width} ${profile.height}"><rect width="100%" height="100%" fill="white"/>${content}</svg>`
const records = [], music = [], sources = new Map(), musicGroups = []
let orderOptimization
let optimizedPacking
const timingFile = resolve(process.argv.find(arg => arg.startsWith('--timing-report='))?.slice(16) ?? join(temp, 'measurement-timings.json'))
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } })
  await page.route('**/*', route => route.request().url().endsWith('/bundle.js')
    ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
    : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html>' }))
  await page.goto('http://scorebook.local/')
  await page.setContent('<style>body{margin:0}#scratch{position:absolute;left:-20000px;top:0}</style><div id="scratch"></div>')
  await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
  await page.evaluate(font => window.scorebook.prepare(font), font.toString('base64'))
  endPhase('browserSetupMs')
  for (const entry of plan.entries) sources.set(entry.id, readFileSync(join(root, 'src/scores', entry.file), 'utf8'))
  await page.evaluate(sources => window.scorebook.prepareSources(sources), [...sources.values()])
  endPhase('fontPreparationMs')
  for (const [index, entry] of plan.entries.entries()) {
    const scoreStarted = performance.now()
    const source = sources.get(entry.id)
    const cached = reused?.entries.find(item => item.file === entry.file && item.sourceSha256 === hash(source) && item.renderCache?.strategy === widthSearchStrategy)
    const { candidates, renderCache } = cached ?? await probeWidthCandidates(width => page.evaluate(async ({ source, width, auditLayout }) => {
      try { return await window.scorebook.measure(source, width, true, undefined, undefined, auditLayout) }
      catch (error) { return { width, error: error.message } }
    }, { source, width, auditLayout }))
    const best = chooseBestWidth(candidates)
    assert(best, `${entry.title}: no safe web layout: ${JSON.stringify(candidates)}`)
    records.push({ ...entry, width: best.width, sourceSha256: hash(source), systems: best.rows, pageCount: best.pageCount, candidates, renderCache, measurement: { wallMs: performance.now() - scoreStarted, reused: Boolean(cached) } })
    writeFileSync(join(temp, 'width-probes.json.tmp'), JSON.stringify({ rendererSha256, auditLayout, entries: records }))
    renameSync(join(temp, 'width-probes.json.tmp'), join(temp, 'width-probes.json'))
    console.log(`${index + 1}/${plan.entries.length} ${entry.title}: ${best.width}px, ${best.pageCount} pages${cached ? ' (reused)' : ''}`)
  }
  endPhase('widthMeasurementsMs')
  saveTimings('measured')
  if (!probeOnly) {
    const before = [...records]
    optimizedPacking = await optimizeScorebookWithRefinement(records, new Set(plan.sections.filter(section => section.reorderForSharing).map(section => section.id)), async (entry, width) => {
      const started = performance.now()
      const result = await page.evaluate(({ source, width, auditLayout }) => window.scorebook.measure(source, width, true, undefined, undefined, auditLayout),
        { source: sources.get(entry.id), width, auditLayout })
      entry.measurement.wallMs += performance.now() - started
      return result
    })
    const baseline = optimizeScorebook(before)
    records.splice(0, records.length, ...optimizedPacking.entries)
    orderOptimization = { pagesBefore: baseline.metrics.pages, pagesAfter: optimizedPacking.metrics.pages,
      moved: records.flatMap((entry, index) => before[index] === entry ? [] : [{ file: entry.file, title: entry.title, from: before.indexOf(entry) + 1, to: index + 1 }]) }
    console.log(`Chapter packing: ${orderOptimization.pagesBefore} -> ${orderOptimization.pagesAfter} music pages`)
  }
  if (!probeOnly) endPhase('packingMs')
  if (!probeOnly) for (const group of optimizedPacking.groups) {
    const entries = records.slice(group.start, group.end), start = music.length
    if (entries.length > 1) {
      const rendered = await page.evaluate(({ sources, width, gap, auditLayout }) => window.scorebook.sharedA4Page(sources, width, gap, undefined, auditLayout),
        { sources: entries.map(entry => sources.get(entry.id)), width: group.width, gap: sharedScoreGap, auditLayout })
      music.push({ kind: 'music', ids: entries.map(entry => entry.id), svg: pageSvg(rendered.markup) })
      musicGroups.push({ musicStart: start, width: group.width, usedHeight: rendered.usedHeight, coreGap: rendered.coreGap, scoreGap: rendered.scoreGap, trailingGap: rendered.trailingGap,
        items: entries.map((entry, index) => ({ id: entry.id, top: rendered.items[index].top, height: rendered.items[index].sourceHeight })) })
      console.log(`Shared ${group.width}px: ${entries.map(entry => entry.title).join(' / ')}`)
    } else {
      const entry = entries[0]
      const pages = await page.evaluate(({ source, width }) => window.scorebook.a4Pages(source, width), { source: sources.get(entry.id), width: group.width })
      assert.equal(pages.length, group.pageCount, `${entry.title} at ${group.width}px: measured and rendered page counts must match`)
      for (const rendered of pages) music.push({ kind: 'music', id: entry.id, svg: pageSvg(rendered.markup) })
    }
    for (const entry of entries) {
      const candidate = [...entry.candidates, ...(entry.sharedCandidates ?? [])].find(candidate => candidate.width === group.width)
      Object.assign(entry, { width: chooseBestWidth(entry.candidates).width, bookWidth: group.width, systems: candidate.rows, pageCount: group.pageCount, musicStart: start })
    }
  }
  if (!probeOnly) { endPhase('pageRenderingMs'); saveTimings('rendered') }
} finally { await browser.close() }
endPhase('browserCloseMs')
function saveTimings(status = 'complete') {
  const report = { status, auditLayout, rendererSha256, strategy: widthSearchStrategy, scoreCount: records.length,
    measuredScores: records.filter(entry => !entry.measurement.reused).length,
    reusedScores: records.filter(entry => entry.measurement.reused).length,
    totalMs: performance.now() - runStarted, stages,
    mode: reuseFile ? 'explicit-reuse' : 'full-measurement',
    environment: { node: process.version, chromium: browser.version(), platform: process.platform, arch: process.arch,
      cpu: cpus()[0]?.model, parallelism: availableParallelism() },
    fontSha256: hash(font),
    ...summarizeMeasurements(records) }
  mkdirSync(resolve(timingFile, '..'), { recursive: true })
  writeFileSync(timingFile, JSON.stringify(report, null, 2) + '\n')
  console.log(`Measurement timings: ${timingFile} (${(report.totalMs / 1000).toFixed(2)}s total, ${(stages.widthMeasurementsMs / 1000).toFixed(2)}s widths)`)
}
if (probeOnly) { saveTimings(); console.log(`Width probes complete: ${records.length} scores`); process.exit(0) }

// Book furniture does not alter the engraved score pages.
const tocRows = plan.sections.flatMap(section => [{ section }, ...records.filter(entry => entry.section === section.id).map(entry => ({ entry }))])
const tocColumns = []
const { rowsPerColumn, rowHeight } = plan.contents
for (const row of tocRows) {
  let column = tocColumns.at(-1)
  if (!column || column.length >= rowsPerColumn || row.section && column.length === rowsPerColumn - 1) {
    column = []; tocColumns.push(column)
  }
  column.push(row)
}
const tocCount = Math.ceil(tocColumns.length / 2), frontCount = 1 + tocCount
for (const entry of records) {
  entry.pages = Array.from({ length: entry.pageCount }, (_, index) => frontCount + entry.musicStart + index + 1)
  delete entry.musicStart
}
const pages = [{ kind: 'cover', svg: pageSvg(text(plan.title, profile.width / 2, 350, 40, 'text-anchor="middle" data-scorebook-url="https://score.cheesefans.com/"')
  + text('https://score.cheesefans.com/', profile.width / 2, 410, 18, 'text-anchor="middle" data-scorebook-url="https://score.cheesefans.com/"')) }]
for (let index = 0; index < tocCount; index++) {
  let content = text('目录', 40, 65, 30)
  for (let side = 0; side < 2; side++) {
    const x = 40 + side * 377, right = x + 337
    for (const [rowIndex, row] of (tocColumns[index * 2 + side] ?? []).entries()) {
      const y = 120 + rowIndex * rowHeight
      if (row.section) content += text(row.section.title, x, y, 16)
      else {
        const entry = row.entry, label = entry.pages.length === 1 ? entry.pages[0] : `${entry.pages[0]}–${entry.pages.at(-1)}`
        content += text(entry.title, x, y, 16) + text(label, right, y, 14, 'text-anchor="end"')
      }
    }
  }
  pages.push({ kind: 'contents', svg: pageSvg(content) })
}
pages.push(...music)
for (const [index, page] of pages.entries()) writeFileSync(join(temp, 'pages', `${String(index + 1).padStart(3, '0')}.svg`), page.svg)
writeFileSync(join(temp, 'unoutlined-pages.json'), JSON.stringify(pages))
const report = { title: plan.title, edition: plan.edition, renderer: 'web', rendererSha256, baseWidth: plan.baseWidth, sourceCount: sourceFiles.length,
  entryCount: records.length, pageCount: pages.length, frontPages: frontCount, page: profile, orderOptimization,
  packing: { policy: packingPolicy, ...optimizedPacking.metrics },
  widthSearch: { strategy: widthSearchStrategy, minimum: widthMinimum, maximum: widthMaximum, step: widthStep, priority: ['pageCount', 'qualityScore', 'width'] }, pageMarginEm: 0, a4MarginMm: 12, coreSpacing: { continuous: 26.4, pagedMinimum: 26.4, defaultLeadingEm: 1.2, pagedMaximum: 32, collisionRatio: .5, shared: 'page' },
  sharedPages: musicGroups.map(({ musicStart, ...group }) => ({ page: frontCount + musicStart + 1, ...group })), sharedScoreGap, sharedPreferredWidth,
  sharedWidthSearch: { minimum: widthMinimum, maximum: sharedWidthMaximum, step: widthStep, refinementOffset: widthStep / 2, eligibilityWidth: sharedWidthMaximum },
  entries: records, validation: { outside: auditLayout ? 0 : null, overlaps: auditLayout ? 0 : null, geometryAudited: auditLayout, sourceCoverage: true } }
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'layout-record.json'), JSON.stringify(report, null, 2) + '\n')
writeFileSync(join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><title>谱集预览</title><style>body{background:#ddd}figure{display:inline-block;width:380px;margin:10px;vertical-align:top}img{width:100%}</style>'
  + pages.map((page, index) => `<figure><figcaption>第${index + 1}页 · ${page.kind}</figcaption><img loading="lazy" src="pages/${String(index + 1).padStart(3, '0')}.svg"></figure>`).join(''))
// Packaging only embeds glyphs at their resolved positions; it never re-engraves.
endPhase('bookFilesMs')
execFileSync(process.execPath, [join(root, 'tools/compact-scorebook-pdf.mjs'), `--plan=${planFile}`], { stdio: 'inherit' })
endPhase('pdfPackagingMs')
writeFileSync(join(output, 'layout-record.json'), JSON.stringify(report, null, 2) + '\n')
const csv = [['曲目', '最佳宽度px', '谱集版宽px', '页码'], ...records.map(entry => [entry.title, entry.width, entry.bookWidth, entry.pages.join('/')])]
  .map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n')
writeFileSync(join(output, '排序与缩放记录.csv'), csv + '\n')
endPhase('finalizeMs')
saveTimings()
console.log(JSON.stringify({ entries: records.length, pages: pages.length, pdf: join(output, plan.outputPdf) }))
