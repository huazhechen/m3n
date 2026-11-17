import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { chooseBestWidth, widthCandidates } from './scorebook-width.mjs'
import { writePreferredWidths } from './scorebook-source.mjs'

const root = resolve(import.meta.dirname, '..'), output = join(root, 'scorebook')
const planFile = resolve(process.argv.find(arg => arg.startsWith('--plan='))?.slice(7) ?? join(output, 'editorial-plan.json'))
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
const font = readFileSync(join(root, 'public/fonts/NotoSerifCJKsc-Regular.otf'))
const rendererSha256 = createHash('sha256').update(readFileSync(join(temp, 'bundle/bundle.js'))).update(font).digest('hex')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const text = (value, x, y, size = 16, attrs = '') => `<text x="${x}" y="${y}" font-size="${size}" font-family="Scorebook Text" ${attrs}>${escape(value)}</text>`
const pageSvg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 ${profile.width} ${profile.height}"><rect width="100%" height="100%" fill="white"/>${content}</svg>`
const records = [], music = []
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } })
  await page.route('**/*', route => route.request().url().endsWith('/bundle.js')
    ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
    : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html>' }))
  await page.goto('http://scorebook.local/')
  await page.setContent('<style>body{margin:0}#scratch{position:absolute;left:-20000px;top:0}</style><div id="scratch"></div>')
  await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
  await page.evaluate(font => window.scorebook.prepare(font), font.toString('base64'))
  for (const [index, entry] of plan.entries.entries()) {
    const source = readFileSync(join(root, 'src/scores', entry.file), 'utf8')
    const candidates = []
    for (const width of widthCandidates) {
      candidates.push(await page.evaluate(async ({ source, width }) => {
        try { return await window.scorebook.measure(source, width) }
        catch (error) { return { width, error: error.message } }
      }, { source, width }))
    }
    const best = chooseBestWidth(candidates)
    assert(best, `${entry.title}: no safe web layout: ${JSON.stringify(candidates)}`)
    const pages = await page.evaluate(({ source, width }) => window.scorebook.a4Pages(source, width), { source, width: best.width })
    assert.equal(pages.length, best.pageCount)
    const start = music.length
    for (const rendered of pages) music.push({ kind: 'music', id: entry.id, svg: pageSvg(rendered.markup) })
    records.push({ ...entry, width: best.width, sourceSha256: hash(source), systems: best.rows, pageCount: best.pageCount, musicStart: start, candidates })
    console.log(`${index + 1}/${plan.entries.length} ${entry.title}: ${best.width}px, ${best.pageCount} pages`)
  }
} finally { await browser.close() }

// Book furniture does not alter the engraved score pages.
const tocRows = plan.sections.flatMap(section => [{ section }, ...records.filter(entry => entry.section === section.id).map(entry => ({ entry }))])
const tocColumns = [], rowsPerColumn = 25
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
const pages = [{ kind: 'cover', svg: pageSvg(text(plan.title, 60, 290, 48) + text(plan.edition, 60, 350, 22)
  + text('网页统一排版 · A4 简谱', 60, 410, 22) + text(`${records.length} 份完整曲谱`, 60, 450, 18)
  + plan.sections.map((section, index) => text(section.title, 60, 600 + index * 50, 20)).join('')) }]
for (let index = 0; index < tocCount; index++) {
  let content = text('目录', 40, 65, 30)
  for (let side = 0; side < 2; side++) {
    const x = 40 + side * 377, right = x + 337
    for (const [rowIndex, row] of (tocColumns[index * 2 + side] ?? []).entries()) {
      const y = 120 + rowIndex * 37
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
  entryCount: records.length, pageCount: pages.length, frontPages: frontCount, page: profile,
  widthSearch: { minimum: 640, maximum: 800, step: 10, priority: ['pageCount', 'width'] }, pageMarginEm: .5, a4MarginMm: 12,
  entries: records, validation: { outside: 0, overlaps: 0, sourceCoverage: true } }
writeFileSync(join(output, 'layout-record.json'), JSON.stringify(report, null, 2) + '\n')
writeFileSync(join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><title>谱集预览</title><style>body{background:#ddd}figure{display:inline-block;width:380px;margin:10px;vertical-align:top}img{width:100%}</style>'
  + pages.map((page, index) => `<figure><figcaption>第${index + 1}页 · ${page.kind}</figcaption><img loading="lazy" src="pages/${String(index + 1).padStart(3, '0')}.svg"></figure>`).join(''))
// Packaging only embeds glyphs at their resolved positions; it never re-engraves.
execFileSync(process.execPath, [join(root, 'tools/compact-scorebook-pdf.mjs'), `--plan=${planFile}`], { stdio: 'inherit' })
// Publish source defaults only after a validated PDF exists. Check all sources
// first so an edit made during the search cannot be silently overwritten.
writePreferredWidths(records, join(root, 'src/scores'))
writeFileSync(join(output, 'layout-record.json'), JSON.stringify(report, null, 2) + '\n')
const csv = [['曲目', '最佳宽度px', '页码'], ...records.map(entry => [entry.title, entry.width, entry.pages.join('/')])]
  .map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n')
writeFileSync(join(output, '排序与缩放记录.csv'), csv + '\n')
console.log(JSON.stringify({ entries: records.length, pages: pages.length, widths: 'preferred-width headers', pdf: join(output, plan.outputPdf) }))
