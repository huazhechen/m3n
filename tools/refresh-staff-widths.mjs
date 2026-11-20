import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { writePreferredWidths } from './scorebook-source.mjs'
import { chooseBestWidth } from './scorebook-width.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = join(root, 'src/scores'), output = join(root, '.tmp/staff-widths')
const probeOnly = process.argv.includes('--probe-only')
assert(process.argv.slice(2).every(arg => arg === '--probe-only'), 'Only --probe-only is supported')
mkdirSync(output, { recursive: true })
// Keep the hosted dist/ untouched; Playwright serves these files in memory, with no dev server.
await build({ configFile: false, logLevel: 'error', base: '/', define: { 'import.meta.url': JSON.stringify('http://staff-widths.local/bundle.js') }, build: {
  outDir: join(output, 'bundle'), emptyOutDir: true, minify: false,
  lib: { entry: join(root, 'tools/staff-width-layout.mjs'), name: 'staffWidths', formats: ['iife'], fileName: () => 'bundle.js' },
} })
const launchOptions = { executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true }
const entries = [], hash = value => createHash('sha256').update(value).digest('hex')
const rendererSha256 = hash(Buffer.concat([readFileSync(join(output, 'bundle/bundle.js')), readFileSync(join(root, 'packages/score-renderer/vendor/verovio/verovio-module.wasm'))]))
const previous = existsSync(join(output, 'report.json')) ? JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')) : undefined
const reusable = new Map(previous?.rendererSha256 === rendererSha256 ? previous.entries.map(entry => [entry.file, entry]) : [])
const report = { rendererSha256, range: [540, 720], step: 5, candidateStep: 10, stabilityOffsets: [-5, 0, 5], criterion: 'minimum page count, then minimum width', entries }
const saveReport = () => {
  const path = join(output, 'report.json')
  writeFileSync(path + '.tmp', JSON.stringify({ ...report, entries: entries.filter(Boolean) }, null, 2) + '\n')
  renameSync(path + '.tmp', path)
}
// Capture every input before measuring; writePreferredWidths verifies all digests before writing.
const inputs = readdirSync(directory).filter(file => file.endsWith('.m3n')).sort().map(file => ({ file, source: readFileSync(join(directory, file), 'utf8') }))
async function refresh() {
  for (const [index, { file, source }] of inputs.entries()) {
    // A fresh browser releases the complete WASM/renderer heap after each score.
    console.log(`Measuring ${file}`)
    const browser = await chromium.launch(launchOptions)
    try {
      const page = await browser.newPage()
      await page.route('http://staff-widths.local/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none;text-rendering:optimizeLegibility"><body></body></html>' })
        if (pathname === '/verovio-module.wasm') return route.fulfill({ path: join(root, 'packages/score-renderer/vendor/verovio/verovio-module.wasm'), contentType: 'application/wasm' })
        const file = resolve(output, 'bundle', '.' + pathname)
        if (!file.startsWith(join(output, 'bundle') + '/') || !existsSync(file)) return route.abort()
        return route.fulfill({ path: file, contentType: pathname.endsWith('.wasm') ? 'application/wasm' : 'application/javascript' })
      })
      await page.goto('http://staff-widths.local/')
      await page.addScriptTag({ url: 'http://staff-widths.local/bundle.js' })
      await page.evaluate(() => window.staffWidths.prepare())
      const cached = reusable.get(file)
      const { candidates, renderCache } = cached?.sourceSha256 === hash(source) ? cached : await page.evaluate(source => window.staffWidths.search(source), source)
      assert(candidates.every(item => Number.isInteger(item.pageCount) && item.pageCount > 0), `${file}: invalid page counts`)
      let best, verificationCases
      // Count all 5px probes first; fully render each prospective winner and both
      // neighbors. Unsafe candidates are rejected using the same policy as numbered scores.
      while ((best = chooseBestWidth(candidates))) {
        verificationCases = []
        for (const offset of [-5, 0, 5]) verificationCases.push(await page.evaluate(({ source, width }) => window.staffWidths.measure(source, width, true), { source, width: best.width + offset }))
        best.verificationCases = verificationCases
        if (verificationCases.every(item => item.pageCount === best.pageCount && !item.outside.length)) break
        best.stable = false
        best.rejection = 'Full SVG verification failed at the candidate or its 5px neighbors'
      }
      assert(best, `${file}: no stable safe width in 540–720px`)
      entries[index] = { file, sourceSha256: hash(source), width: best.width, pageCount: best.pageCount, candidates, renderCache, verificationCases }
      saveReport()
      console.log(`${index + 1}/${inputs.length} ${file}: ${best.width}px, ${best.pageCount} pages`)
    } finally { await browser.close() }
  }
}
await refresh()
if (!probeOnly) writePreferredWidths(entries, directory, 'staff-preferred-width')
report.written = !probeOnly
saveReport()
console.log(JSON.stringify({ scores: entries.length, written: report.written, report: join(output, 'report.json') }))
