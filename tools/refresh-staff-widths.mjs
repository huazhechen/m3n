import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { chooseBestWidth, widthCandidates, widthSearchStrategy, widthStep } from './scorebook-width.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = join(root, 'src'), output = join(root, '.tmp/staff-widths')
assert(process.argv.slice(2).every(arg => ['--probe-only', '--fresh'].includes(arg)), 'Only --probe-only and --fresh are supported')
mkdirSync(output, { recursive: true })
// Keep the hosted dist/ untouched; Playwright serves these files in memory, with no dev server.
await build({ configFile: false, logLevel: 'error', base: '/', define: { 'import.meta.url': JSON.stringify('http://staff-widths.local/bundle.js') }, build: {
  outDir: join(output, 'bundle'), emptyOutDir: true, minify: false,
  lib: { entry: join(root, 'tools/staff-width-layout.mjs'), name: 'staffWidths', formats: ['iife'], fileName: () => 'bundle.js' },
} })
const launchOptions = { executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true }
const entries = [], hash = value => createHash('sha256').update(value).digest('hex')
const rendererSha256 = hash(readFileSync(join(output, 'bundle/bundle.js')))
const report = { rendererSha256, strategy: widthSearchStrategy, range: [widthCandidates[0], widthCandidates.at(-1)], step: widthStep, criterion: 'safe geometry, minimum page count, maximum composite quality, then minimum width', entries }
const saveReport = () => {
  const path = join(output, 'report.json')
  writeFileSync(path + '.tmp', JSON.stringify({ ...report, entries: entries.filter(Boolean) }, null, 2) + '\n')
  renameSync(path + '.tmp', path)
}
// Capture every input before measuring so reports describe a consistent source snapshot.
const inputs = ['scores', 'works'].flatMap(scope => readdirSync(join(directory, scope))
  .filter(file => file.endsWith('.m3n')).sort()
  .map(name => {
    const file = join(scope, name)
    return { file, source: readFileSync(join(directory, file), 'utf8') }
  }))
async function refresh() {
  for (const [index, { file, source }] of inputs.entries()) {
    // A fresh browser releases the complete renderer heap after each score.
    console.log(`Measuring ${file}`)
    const browser = await chromium.launch(launchOptions)
    try {
      const page = await browser.newPage()
      await page.route('http://staff-widths.local/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none;text-rendering:optimizeLegibility"><body></body></html>' })
        const file = resolve(output, 'bundle', '.' + pathname)
        if (!file.startsWith(join(output, 'bundle') + '/') || !existsSync(file)) return route.abort()
        return route.fulfill({ path: file, contentType: pathname.endsWith('.wasm') ? 'application/wasm' : 'application/javascript; charset=utf-8' })
      })
      await page.goto('http://staff-widths.local/')
      await page.addScriptTag({ url: 'http://staff-widths.local/bundle.js' })
      await page.evaluate(() => window.staffWidths.prepare())
      const measurementStarted = performance.now()
      const { candidates, renderCache } = await page.evaluate(source => window.staffWidths.search(source), source)
      const measurement = { wallMs: performance.now() - measurementStarted, reused: false }
      assert(candidates.length, `${file}: no width candidates`)
      let best, verification
      // Recheck the actual chosen width, including reused search results.
      while ((best = chooseBestWidth(candidates))) {
        verification = await page.evaluate(({ source, width }) => window.staffWidths.measure(source, width, true), { source, width: best.width })
        if (verification.pageCount === best.pageCount && !verification.outside.length && !verification.overlaps.length) break
        Object.assign(best, verification, { error: 'Full SVG verification failed at the candidate width' })
      }
      assert(best, `${file}: no safe width in 480–720px`)
      entries[index] = { file, sourceSha256: hash(source), width: best.width, pageCount: best.pageCount, candidates, renderCache, measurement, verification }
      saveReport()
      console.log(`${index + 1}/${inputs.length} ${file}: ${best.width}px, ${best.pageCount} pages`)
    } finally { await browser.close() }
  }
}
await refresh()
report.written = false
saveReport()
console.log(JSON.stringify({ scores: entries.length, written: report.written, report: join(output, 'report.json') }))
