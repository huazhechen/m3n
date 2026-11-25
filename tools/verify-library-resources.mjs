// Use a single Node process for the full-book browser audit, then close Chromium
// before parsing the PDF. Run after an isolated production build; no Vite server.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(process.argv[2] ?? '.tmp/playwright-dist-4173')
const output = resolve('.tmp/library-resources-audit')
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
    args: ['--disable-gpu', '--single-process', '--no-zygote', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--max-old-space-size=384'] })
  const page = await browser.newPage()
  page.on('request', request => { if (/\.(gz|ttf|woff2)$/.test(request.url())) requests.push(new URL(request.url()).pathname) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(address + '/scores')
  await page.locator('a.score-card').filter({ hasText: '小星星' }).first().click()
  await page.locator('svg[data-engine="m3n"]').first().waitFor()
  assert.equal(requests.filter(path => path.endsWith('.gz')).length, 2)
  assert.equal(requests.filter(path => /\.(ttf|woff2)$/.test(path)).length, 0)
  await page.goBack()
  // A fresh page re-installs fonts, but both package responses come from HTTP cache.
  await page.reload()
  await page.evaluate(() => {
    window.exportStages = new Set()
    new MutationObserver(() => {
      for (const match of document.body.textContent.matchAll(/第 ([123])\/3 阶段/g)) window.exportStages.add(match[1])
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  const started = performance.now()
  await page.getByRole('button', { name: '导出全量谱集' }).click()
  await page.getByRole('button', { name: '下载 PDF', exact: true }).waitFor({ timeout: 210_000 })
  assert.deepEqual(await page.evaluate(() => [...window.exportStages]), ['1', '2', '3'])
  const downloads = [...hits].filter(([path]) => path.endsWith('.gz'))
  assert.equal(downloads.length, 2)
  assert(downloads.every(([, count]) => count === 1), 'HTTP cache should serve both packages after reload')
  assert.equal(requests.filter(path => /\.(ttf|woff2)$/.test(path)).length, 0)
  assert.deepEqual(errors, [])
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
  await (await pending).saveAs(resolve(output, 'scorebook.pdf'))
  report = { exportMs: performance.now() - started, downloads, requests, stages: ['1', '2', '3'], errors }
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib')
const bytes = await readFile(resolve(output, 'scorebook.pdf')), pdf = await PDFDocument.load(bytes)
assert(pdf.getPageCount() > 80)
const fonts = new Set()
for (const [, object] of pdf.context.enumerateIndirectObjects()) {
  if (!(object instanceof PDFDict)) continue
  assert.notEqual(object.get(PDFName.of('Subtype')), PDFName.of('Image'))
  const name = object.get(PDFName.of('BaseFont'))?.toString()
  if (name) fonts.add(name)
}
assert([...fonts].some(font => /Bravura/.test(font)))
Object.assign(report, { pages: pdf.getPageCount(), pdfBytes: bytes.length, fonts: [...fonts] })
const { writeFile } = await import('node:fs/promises')
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
