import { chromiumLaunchOptions } from './lib/chromium-options.mjs'
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
  const plan = { title: '测试谱集', page: { width: 794, height: 1123 }, contents: { rowHeightEm: 1.25 },
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
      export {measureNumberedWidth} from ${JSON.stringify(join(root, 'tools/lib/numbered-width-measurement.mjs'))};
      export {NumberedLayoutTask, NumberedTextMeasurementCache} from ${JSON.stringify(join(root, 'packages/numbered-notation/dist/index.js'))};
      export {search as staffSearch} from ${JSON.stringify(join(root, 'tools/staff-width-layout.mjs'))};
      export {optimizeScorebook, refineSharedWidths} from ${JSON.stringify(join(root, 'tools/scorebook-packing.mjs'))};`)
    await buildBrowserTestBundle({ root, entry, outDir: join(temp, 'bundle'), fixtures: { plan, sources, files } })
    browser = await chromium.launch(chromiumLaunchOptions())
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
      const document = api.parseM3NDocument(sources[0])
      const cachedSettings = () => ({ layoutTask: new api.NumberedLayoutTask(), textMeasurementCache: new api.NumberedTextMeasurementCache() })
      const settings = cachedSettings()
      const measure = settings => api.measureNumberedWidth(document, 540, { settings, detailedTimings: true }).candidate
      const first = measure(settings)
      const repeated = measure(settings)
      const fresh = measure(cachedSettings())
      const cacheLifecycle = { first: first.timings.textMeasureCalls ?? 0, repeated: repeated.timings.textMeasureCalls ?? 0,
        fresh: fresh.timings.textMeasureCalls ?? 0, hits: repeated.timings.textMeasureCacheHits ?? 0 }
      const entries = [], auditedEntries = []
      for (const [index, source] of sources.entries()) {
        const { candidates } = await api.probeWidthCandidates(width => api.measure(source, width))
        entries.push({ ...plan.entries[index], candidates })
        const audited = await api.probeWidthCandidates(width => api.auditWidth(source, width))
        auditedEntries.push(audited.candidates.map(({ timings: _timings, ...candidate }) => candidate))
      }
      await api.refineSharedWidths(entries, (entry, width) => api.measure(sources[Number(entry.id)], width))
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
        // Compare the pruned reader with a reference that measures every grid candidate.
        const full = await api.staffSearch(source, { prune: false })
        const best = api.chooseBestWidth(full.candidates)
        staffWidths.push({ full: best?.width, reader: await api.chooseStaffScoreWidth(document, { paged: true }),
          candidates: full.candidates.map(candidate => candidate.width) })
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
      assert.equal(staff.reader, staff.full)
      assert.deepEqual(staff.candidates.filter(width => width % 24 === 0), Array.from({ length: 9 }, (_, i) => 528 + i * 24))
      assert(staff.candidates.every(width => width >= 528 && width <= 720 && width % 6 === 0))
      assert.equal(staff.candidates.length, 33)
    }
    assert.equal(comparison.soloSharedPages, 0)
    assert.deepEqual(comparison.soloOnline, comparison.soloLocal.map(group => Array(group.end - group.start).fill(group.width)))
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})

test('both notations reorder a chapter around a solo-only work with identical bounded and exhaustive PDFs', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-reordered-book-'))
  const files = ['xiao_xing_xing_01.m3n', 'solo-fixture.m3n', 'hong_he_gu_01.m3n']
  const sources = [files[0], files[0], files[2]].map(file => readFileSync(join(root, 'src/scores', file), 'utf8'))
  const plan = { title: '测试谱集', page: { width: 794, height: 1123 }, contents: { rowHeightEm: 1.25 },
    sections: [{ id: 'basics', title: '基础练习曲', reorderForSharing: true }],
    entries: files.map((file, index) => ({ id: String(index), file, title: ['小星星', '独占曲目', '红河谷'][index],
      section: 'basics', sharePage: index !== 1 })) }
  const fontAssets = browserTestFontAssets(root, { fontFile: join(temp, 'bundle/fixture-font.ttf') })
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export {buildOnlineScorebook} from ${JSON.stringify(join(root, 'src/lib/online-scorebook.ts'))};`)
    await buildBrowserTestBundle({ root, entry, outDir: join(temp, 'bundle'), fixtures: { plan, sources, files } })
    browser = await chromium.launch(chromiumLaunchOptions())
    const page = await browser.newPage()
    await page.route('**/*', async route => await fontAssets.fulfill(route) ? undefined
      : new URL(route.request().url()).pathname === '/bundle.js'
        ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
        : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    for (const notationMode of ['movable', 'staff']) {
      const result = await page.evaluate(async notationMode => {
        const build = options => window.scorebook.buildOnlineScorebook(new AbortController().signal, () => {}, { notationMode, ...options })
        const summary = book => ({ groups: book.measurementTimings.groups, sharedPages: book.sharedPages,
          pages: book.pages.map(svg => svg.outerHTML),
          order: book.pages.slice(2).flatMap(svg => [...svg.querySelectorAll(':scope > svg')].map(score => score.dataset.scoreSlug)) })
        const full = summary(await build({ pruneSearch: false }))
        const pruned = summary(await build({ pruneSearch: true }))
        // Audit mode independently checks the final shared SVG's actual ink.
        const audited = await build({ auditLayout: true })
        return { full, pruned, auditedGroups: audited.measurementTimings.groups }
      }, notationMode)
      assert.deepEqual(result.pruned, result.full, notationMode + ' must preserve final SVG pages and groups')
      assert.deepEqual(result.auditedGroups, result.full.groups)
      assert.equal(result.full.sharedPages, 1)
      assert.deepEqual(result.full.order, ['0', '2', '1'])
      assert.deepEqual(result.full.groups.map(group => group.files), [[files[0], files[2]], [files[1]]])
      assert(result.full.groups[0].width >= 528 && result.full.groups[0].width <= 624 && result.full.groups[0].width % 6 === 0)
    }
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
