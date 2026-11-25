// Use a single Node process for the full-book browser audit, then close Chromium
// before parsing the PDF. Run after an isolated production build; no Vite server.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { cpus } from 'node:os'
import { chromium } from '@playwright/test'

const root = resolve(process.argv[2] ?? '.tmp/playwright-dist-4173')
const notation = process.argv[3] ?? 'movable'
assert(['movable', 'staff'].includes(notation), 'Notation must be movable or staff')
const output = resolve(process.env.M3N_EXPORT_AUDIT_OUTPUT ?? `.tmp/library-resources-audit-${notation}`)
const plan = JSON.parse(await readFile(resolve('config/scorebook/editorial-plan.json'), 'utf8'))
await mkdir(output, { recursive: true })
const hits = new Map(), requests = [], errors = []
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.gz': 'application/gzip' }
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    hits.set(path, (hits.get(path) ?? 0) + 1)
    let file = resolve(root, '.' + path)
    if (!file.startsWith(root + sep) && file !== root) return response.writeHead(403).end()
    if (!extname(path)) file = resolve(root, 'index.html')
    const info = await stat(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
    createReadStream(file).pipe(response)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = `http://127.0.0.1:${server.address().port}`
const executablePath = process.env.CHROMIUM_PATH ?? ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
let browser, report
try {
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true,
    args: ['--disable-gpu', '--single-process', '--no-zygote', '--disable-features=SpareRendererForSitePerProcess', `--js-flags=--max-old-space-size=${process.env.M3N_BROWSER_HEAP_MB ?? '384'}`] })
  const page = await browser.newPage()
  page.on('request', request => { if (/\.(gz|ttf|woff2)$/.test(request.url())) requests.push(new URL(request.url()).pathname) })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.text().startsWith('[export-audit]')) console.log(message.text()) })
  await page.goto(address + '/scores')
  await page.locator('a.score-card').filter({ hasText: '小星星' }).first().click()
  await page.locator('svg[data-engine="m3n"]').first().waitFor()
  assert.equal(requests.filter(path => path.endsWith('.gz')).length, 2)
  assert.equal(requests.filter(path => /\.(ttf|woff2)$/.test(path)).length, 0)
  await page.goBack()
  // A fresh page re-installs fonts, but both package responses come from HTTP cache.
  await page.reload()
  await page.evaluate(() => {
    window.exportStarted = performance.now()
    window.exportStages = new Set()
    window.exportPhases = []
    let previous = ''
    new MutationObserver(() => {
      const status = document.querySelector('dialog [role="status"]')?.textContent ?? ''
      const phase = status.match(/正在[^：…\d]+/)?.[0] ?? ''
      if (phase && phase !== previous) {
        const ms = performance.now() - window.exportStarted
        window.exportPhases.push({ phase, ms }); previous = phase
        console.info('[export-audit]', Math.round(ms), phase)
      }
      for (const match of document.body.textContent.matchAll(/第 ([123])\/3 阶段/g)) window.exportStages.add(match[1])
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  const metrics = await page.context().newCDPSession(page)
  const heapSamples = []
  page.on('console', async message => {
    if (!message.text().startsWith('[export-audit]')) return
    try { heapSamples.push({ phase: message.text(), ...await metrics.send('Runtime.getHeapUsage') }) } catch {}
  })
  const profiler = process.env.M3N_EXPORT_CPU_PROFILE ? metrics : undefined
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start') }
  const started = performance.now()
  await page.getByRole('button', { name: '导出全量谱集' }).click()
  await page.getByRole('button', { name: notation === 'staff' ? '五线谱' : '简谱', exact: true }).click()
  await page.getByRole('button', { name: '下载 PDF', exact: true }).waitFor({ timeout: 210_000 })
  const readyMs = performance.now() - started
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop')
    await writeFile(resolve(output, 'export.cpuprofile'), JSON.stringify(profile))
  }
  const summary = await page.locator('[role="status"]').filter({ hasText: 'PDF 已准备好' }).innerText()
  const scoreCount = Number(summary.match(/(\d+) 首/)[1])
  assert.equal(scoreCount, plan.entries.length)
  const stages = await page.evaluate(() => [...window.exportStages])
  assert(stages.includes('2') && stages.includes('3'))
  const downloads = [...hits].filter(([path]) => path.endsWith('.gz'))
  assert.equal(downloads.length, 2)
  assert(downloads.every(([, count]) => count === 1), 'HTTP cache should serve both packages after reload')
  assert.equal(requests.filter(path => /\.(ttf|woff2)$/.test(path)).length, 0)
  assert.deepEqual(errors, [])
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
  await (await pending).saveAs(resolve(output, 'scorebook.pdf'))
  const exportMs = performance.now() - started
  if (process.env.M3N_EXPORT_MEMORY_AUDIT) {
    await metrics.send('HeapProfiler.collectGarbage')
    heapSamples.push({ phase: 'ready-after-gc', ...await metrics.send('Runtime.getHeapUsage') })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await metrics.send('HeapProfiler.collectGarbage')
    heapSamples.push({ phase: 'closed-after-gc', ...await metrics.send('Runtime.getHeapUsage') })
  }
  report = { notation, scoreCount, heapSamples, environment: { chromium: browser.version(), node: process.version, cpu: cpus()[0]?.model }, readyMs, exportMs, phases: await page.evaluate(() => window.exportPhases), downloads, requests, stages, errors }
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
const { PDFDocument, PDFDict, PDFName, PDFArray } = await import('pdf-lib')
const bytes = await readFile(resolve(output, 'scorebook.pdf')), pdf = await PDFDocument.load(bytes)
assert(pdf.getPageCount() > 80)
const fonts = new Set(), scoreLinks = new Set()
for (const [, object] of pdf.context.enumerateIndirectObjects()) {
  if (!(object instanceof PDFDict)) continue
  assert.notEqual(object.get(PDFName.of('Subtype')), PDFName.of('Image'))
  const name = object.get(PDFName.of('BaseFont'))?.toString()
  if (name) fonts.add(name)
}
for (const page of pdf.getPages()) {
  const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  for (const reference of annotations?.asArray() ?? []) {
    const annotation = pdf.context.lookup(reference, PDFDict)
    const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict)
    const uri = action?.get(PDFName.of('URI'))
    if (uri && /\/scores\//.test(uri.decodeText())) scoreLinks.add(uri.decodeText())
  }
  assert(Math.abs(page.getWidth() - 595.276) < 1 && Math.abs(page.getHeight() - 841.89) < 1, 'Every page must be A4')
}
assert.deepEqual(scoreLinks, new Set(plan.entries.map(entry => `https://score.cheesefans.com/scores/${encodeURIComponent(entry.file.replace(/\.m3n$/, ''))}`)), 'Every current score must have its own PDF link')
assert([...fonts].some(font => /Bravura/.test(font)))
Object.assign(report, { pages: pdf.getPageCount(), scoreLinks: scoreLinks.size, pdfBytes: bytes.length, fonts: [...fonts] })
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (process.env.M3N_EXPORT_MAX_MS) assert(report.exportMs < Number(process.env.M3N_EXPORT_MAX_MS), `Export took ${report.exportMs.toFixed(0)}ms`)
