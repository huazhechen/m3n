import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildBrowserTestBundle } from './lib/browser-test-bundle.mjs'
import { chromium } from '@playwright/test'
import { browserTestFontAssets } from './lib/browser-test-font-assets.mjs'

test('reader, online and local PDF paths share safe width selection; staff reader matches local measurement', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-pdf-parity-'))
  const files = ['xiao_xing_xing_01.m3n', 'hong_he_gu_01.m3n']
  const sources = files.map(file => readFileSync(join(root, 'src/scores', file), 'utf8'))
  const plan = { title: '测试谱集', page: { width: 794, height: 1123 }, contents: { rowsPerColumn: 28, rowHeight: 35 },
    sections: [{ id: 'basics', title: '基础练习曲', reorderForSharing: false }],
    entries: files.map((file, index) => ({ id: String(index), file, title: ['小星星', '红河谷'][index], section: 'basics' })) }
  const fontAssets = browserTestFontAssets(root, { fontFile: join(temp, 'bundle/fixture-font.ttf') })
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export * from ${JSON.stringify(join(root, 'tools/scorebook-layout.mjs'))};
      export {default as parityPlan} from ${JSON.stringify(join(root, 'config/scorebook/editorial-plan.json'))};
      export {buildOnlineScorebook} from ${JSON.stringify(join(root, 'src/lib/online-scorebook.ts'))};
      export {probeWidthCandidates, chooseBestWidth, widthCandidates} from ${JSON.stringify(join(root, 'tools/scorebook-width.mjs'))};
      export {chooseNumberedScoreWidth, chooseStaffScoreWidth} from ${JSON.stringify(join(root, 'src/lib/render-score.ts'))};
      export {parseM3NDocument} from ${JSON.stringify(join(root, 'packages/notation/dist/index.js'))};
      export {search as staffSearch} from ${JSON.stringify(join(root, 'tools/staff-width-layout.mjs'))};
      export {optimizeScorebook} from ${JSON.stringify(join(root, 'tools/scorebook-packing.mjs'))};`)
    await buildBrowserTestBundle({ root, entry, outDir: join(temp, 'bundle'), fixtures: { plan, sources, files } })
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256'] })
    const page = await browser.newPage()
    await page.route('**/*', async route => await fontAssets.fulfill(route) ? undefined : new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><div id="scratch"></div>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    await page.evaluate(() => window.scorebook.prepare())
    const comparison = await page.evaluate(async ({ sources, plan }) => {
      const api = window.scorebook
      await api.prepareSources(sources)
      const first = await api.measure(sources[0], 540)
      const repeated = await api.measure(sources[0], 540)
      await api.prepareSources(sources)
      const fresh = await api.measure(sources[0], 540)
      const cacheLifecycle = { first: first.timings.textMeasureCalls ?? 0, repeated: repeated.timings.textMeasureCalls ?? 0,
        fresh: fresh.timings.textMeasureCalls ?? 0, hits: repeated.timings.textMeasureCacheHits ?? 0 }
      const entries = [], auditedEntries = []
      for (const [index, source] of sources.entries()) {
        const { candidates } = await api.probeWidthCandidates(width => api.measure(source, width))
        entries.push({ ...plan.entries[index], candidates })
        const audited = await api.probeWidthCandidates(width => api.auditWidth(source, width))
        auditedEntries.push(audited.candidates.map(({ timings: _timings, ...candidate }) => candidate))
      }
      const sharedLocal = api.optimizeScorebook(entries, new Set()).groups
      const online = await api.buildOnlineScorebook(new AbortController().signal, () => {})
      const music = online.pages.slice(2)
      const sharedOnline = music.map(svg => [...svg.querySelectorAll(':scope > svg')].map(score => score.viewBox.baseVal.width))
      api.parityPlan.entries[0].sharePage = false
      entries[0].sharePage = false
      const soloLocal = api.optimizeScorebook(entries, new Set()).groups
      const solo = await api.buildOnlineScorebook(new AbortController().signal, () => {})
      const soloOnline = solo.pages.slice(2).map(svg => [...svg.querySelectorAll(':scope > svg')].map(score => score.viewBox.baseVal.width))
      api.parityPlan.entries[0].sharePage = true
      const staffBook = await api.buildOnlineScorebook(new AbortController().signal, () => {}, { notationMode: 'staff', measureNumbers: true })
      const staffMusic = staffBook.pages.slice(2)
      const staffScores = staffMusic.flatMap(svg => [...svg.querySelectorAll(':scope > svg')])
      const staffExport = { sharedPages: staffBook.sharedPages, count: staffScores.length,
        notations: staffScores.map(svg => svg.dataset.notation),
        links: staffScores.map(svg => svg.querySelector('a')?.getAttribute('href')),
        measureNumbers: staffScores.map(svg => svg.querySelectorAll('g.mNum').length),
        fits: staffMusic.every(svg => [...svg.querySelectorAll(':scope > svg')].every(score => Number(score.getAttribute('y')) + Number(score.getAttribute('height')) <= 1123)) }
      const readerWidths = [], staffWidths = []
      for (const source of sources) {
        const document = api.parseM3NDocument(source)
        readerWidths.push(await api.chooseNumberedScoreWidth(document, { paged: true }))
        const local = await api.staffSearch(source)
        const best = api.chooseBestWidth(local.candidates)
        staffWidths.push({ local: best?.width, reader: await api.chooseStaffScoreWidth(document, { paged: true }),
          candidates: local.candidates.map(candidate => candidate.width) })
      }
      return { staffExport, cacheLifecycle, productionCandidates: entries.map(entry => entry.candidates.map(({ timings: _timings, ...candidate }) => candidate)), auditedEntries, readerWidths, staffWidths, sharedLocal, sharedOnline, soloLocal, soloOnline, sharedPages: online.sharedPages, soloSharedPages: solo.sharedPages }
    }, { sources, plan })
    assert.equal(comparison.staffExport.sharedPages, 1)
    assert.equal(comparison.staffExport.count, 2)
    assert.deepEqual(comparison.staffExport.notations, ['staff', 'staff'])
    assert.deepEqual(comparison.staffExport.links, ['https://score.cheesefans.com/scores/0', 'https://score.cheesefans.com/scores/1'])
    assert(comparison.staffExport.measureNumbers.every(count => count > 0))
    assert(comparison.staffExport.fits)
    assert.deepEqual(comparison.productionCandidates, comparison.auditedEntries)
    assert(comparison.cacheLifecycle.first > 0)
    assert.equal(comparison.cacheLifecycle.repeated, 0)
    assert.equal(comparison.cacheLifecycle.fresh, comparison.cacheLifecycle.first)
    assert(comparison.cacheLifecycle.hits > 0)
    assert.equal(comparison.sharedPages, 1)
    assert.deepEqual(comparison.sharedOnline, comparison.sharedLocal.map(group => Array(group.end - group.start).fill(group.width)))
    assert.deepEqual(comparison.readerWidths, comparison.soloLocal.map(group => group.width))
    for (const staff of comparison.staffWidths) {
      assert.equal(staff.reader, staff.local)
      assert.deepEqual(staff.candidates, Array.from({ length: 9 }, (_, i) => 576 + i * 24))
    }
    assert.equal(comparison.soloSharedPages, 0)
    assert.deepEqual(comparison.soloOnline, comparison.soloLocal.map(group => Array(group.end - group.start).fill(group.width)))
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
