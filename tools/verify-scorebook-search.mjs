import { chromiumLaunchOptions } from './lib/chromium-options.mjs'
// Exhaustive versus bounded search with the production bundle and real shared
// fonts. Heavy runs are serial; only small hashes/metadata survive each run.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
const root = resolve(process.argv[2]), mode = process.argv[3] ?? 'movable'
assert(['movable', 'staff', 'fixed'].includes(mode))
const output = resolve(process.argv[4] ?? `.tmp/search-parity-${mode}`)
await mkdir(output, { recursive: true })
const module = (await readdir(resolve(root, 'assets'))).find(file => /^online-scorebook-.*\.js$/.test(file))
assert(module)
const port = Number(process.env.M3N_SEARCH_AUDIT_PORT ?? 4198), address = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['tools/serve-built-web.mjs', `--root=${root}`, `--port=${port}`], { stdio: 'inherit' })
let browser
try {
  const reports = []
  for (const pruneSearch of [false, true]) {
    browser = await chromium.launch(chromiumLaunchOptions())
    const page = await browser.newPage()
    page.on('console', message => { if (message.text().startsWith('[search-audit]')) console.log(message.text()) })
    await page.goto(address + '/scores')
    await page.locator('a.score-card').filter({ hasText: '小星星' }).first().click()
    await page.locator('svg[data-engine="m3n"]').first().waitFor()
    const report = await page.evaluate(async ({ module, mode, pruneSearch }) => {
      const { buildOnlineScorebook } = await import('/assets/' + module)
      const start = performance.now()
      const book = await buildOnlineScorebook(new AbortController().signal, p => {
        if (p.completed === 0) console.info('[search-audit]', pruneSearch, p.phase)
      }, { notationMode: mode, measureNumbers: false, pruneSearch })
      const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      const pages = []
      for (const page of book.pages) { pages.push(await hash(page.outerHTML)); page.replaceChildren() }
      return { pruneSearch, elapsedMs: performance.now() - start, scoreCount: book.scoreCount, sharedPages: book.sharedPages,
        selectedWidths: book.measurementTimings.scores.map(({ file, selectedWidth }) => ({ file, selectedWidth })),
        cacheStats: book.measurementTimings.cacheStats, groups: book.measurementTimings.groups, pages, stages: book.measurementTimings.stages,
        measurements: book.measurementTimings.scores.map(({ file, candidates }) => ({ file, widths: candidates.map(c => c.width) })) }
    }, { module, mode, pruneSearch })
    await writeFile(resolve(output, pruneSearch ? 'pruned.json' : 'exhaustive.json'), JSON.stringify(report, null, 2) + '\n')
    reports.push(report)
    await browser.close(); browser = undefined
  }
  for (const key of ['scoreCount', 'sharedPages', 'selectedWidths', 'groups', 'pages']) assert.deepEqual(reports[1][key], reports[0][key], key + ' must remain identical')
  const count = report => report.measurements.reduce((sum, score) => sum + score.widths.length, 0)
  const summary = { mode, scoreCount: reports[0].scoreCount, pages: reports[0].pages.length,
    identicalSoloWidths: true, identicalGroups: true, identicalSvgPages: true,
    exhaustiveMeasurements: count(reports[0]), prunedMeasurements: count(reports[1]),
    exhaustiveMs: reports[0].elapsedMs, prunedMs: reports[1].elapsedMs }
  await writeFile(resolve(output, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(summary)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
