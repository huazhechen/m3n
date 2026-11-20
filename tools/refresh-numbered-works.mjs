import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { chooseBestWidth, probeWidthCandidates, widthSearchStrategy } from './scorebook-width.mjs'
import { writePreferredWidths } from './scorebook-source.mjs'

// Library defaults are refreshed by build-scorebook, which also validates packing.
// Independent works use the same search and SVG checks without book grouping.
const root = resolve(import.meta.dirname, '..'), directory = join(root, 'src/works')
const output = join(root, '.tmp/numbered-work-widths')
assert(process.argv.length === 2, 'No arguments are supported')
mkdirSync(output, { recursive: true })
const hash = data => createHash('sha256').update(data).digest('hex')
const inputs = readdirSync(directory).filter(file => file.endsWith('.m3n')).sort()
  .map(file => ({ file, source: readFileSync(join(directory, file), 'utf8') }))
await build({ configFile: false, logLevel: 'error', define: { 'import.meta.url': JSON.stringify('http://work-widths.local/bundle.js') }, build: {
  outDir: join(output, 'bundle'), emptyOutDir: true, minify: false,
  lib: { entry: join(root, 'tools/scorebook-layout.mjs'), name: 'scorebook', formats: ['iife'], fileName: () => 'bundle.js' },
} })
const font = readFileSync(join(root, 'tools/fonts/NotoSerifCJKsc-Regular.otf'))
const rendererSha256 = hash(Buffer.concat([readFileSync(join(output, 'bundle/bundle.js')), font]))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
const entries = []
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } })
  await page.route('**/*', route => route.request().url().endsWith('/bundle.js')
    ? route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
    : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html>' }))
  await page.goto('http://work-widths.local/')
  await page.setContent('<style>body{margin:0}#scratch{position:absolute;left:-20000px;top:0}</style><div id="scratch"></div>')
  await page.addScriptTag({ url: 'http://work-widths.local/bundle.js' })
  await page.evaluate(font => window.scorebook.prepare(font), font.toString('base64'))
  for (const { file, source } of inputs) {
    const result = await probeWidthCandidates(width => page.evaluate(({ source, width }) => window.scorebook.measure(source, width), { source, width }))
    const best = chooseBestWidth(result.candidates)
    assert(best, `${file}: no stable safe width`)
    const mobileChecks = []
    for (const width of [320, 390]) for (const paged of [false, true]) {
      const measured = await page.evaluate(({ source, width, paged }) => window.scorebook.measure(source, width, paged), { source, width, paged })
      assert(!measured.error && !measured.outside.length && !measured.overlaps.length, `${file}: unsafe at ${width}px`)
      mobileChecks.push(measured)
    }
    entries.push({ file, sourceSha256: hash(source), width: best.width, pageCount: best.pageCount, ...result, mobileChecks })
    console.log(`${file}: ${best.width}px, ${best.pageCount} pages, ${result.renderCache.uniqueWidths} probes`)
  }
} finally { await browser.close() }
writePreferredWidths(entries, directory)
writeFileSync(join(output, 'report.json'), JSON.stringify({ strategy: widthSearchStrategy, rendererSha256, written: true, entries }, null, 2) + '\n')
