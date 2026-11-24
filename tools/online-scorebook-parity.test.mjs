import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { chromium } from '@playwright/test'

test('reader, online and local PDF paths share safe width selection; staff reader matches local measurement', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-pdf-parity-'))
  const files = ['xiao_xing_xing_01.m3n', 'hong_he_gu_01.m3n']
  const sources = files.map(file => readFileSync(join(root, 'src/scores', file), 'utf8'))
  const plan = { title: '测试谱集', page: { width: 794, height: 1123 }, contents: { rowsPerColumn: 28, rowHeight: 35 },
    sections: [{ id: 'basics', title: '基础练习曲', reorderForSharing: false }],
    entries: files.map((file, index) => ({ id: String(index), file, title: ['小星星', '红河谷'][index], section: 'basics' })) }
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
    await build({ configFile: false, logLevel: 'error', define: { 'import.meta.url': JSON.stringify('http://scorebook.local/bundle.js') },
      plugins: [{ name: 'parity-fixtures', enforce: 'pre', resolveId(id) {
        if (id.endsWith('editorial-plan.json')) return '\0parity-plan'
        if (id === './samples' || id.endsWith('/samples') || id.endsWith('/samples.ts')) return '\0parity-samples'
      }, load(id) {
        if (id === '\0parity-plan') return `export default ${JSON.stringify(plan)}`
        if (id === '\0parity-samples') return `const sources = ${JSON.stringify(sources)};
          export const presetScores = ${JSON.stringify(files.map((sourcePath, index) => ({ slug: String(index), sourcePath })))};
          export async function loadPresetScore(slug) { return sources[Number(slug)] }`
      } }], build: { outDir: join(temp, 'bundle'), lib: { entry, name: 'scorebook', formats: ['iife'], fileName: () => 'bundle.js' } } })
    browser = await chromium.launch({ executablePath: ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
    const page = await browser.newPage()
    await page.route('**/*', route => new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><div id="scratch"></div>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    await page.evaluate(font => window.scorebook.prepare(font), readFileSync(join(root, 'packages/numbered-notation/src/font-assets/NotoSansSC-full.ttf')).toString('base64'))
    const comparison = await page.evaluate(async ({ sources, plan }) => {
      const api = window.scorebook
      const entries = [], auditedEntries = []
      for (const [index, source] of sources.entries()) {
        const { candidates } = await api.probeWidthCandidates(width => api.measure(source, width))
        entries.push({ ...plan.entries[index], candidates })
        const audited = await api.probeWidthCandidates(width => api.auditWidth(source, width))
        auditedEntries.push(audited.candidates.map(({ timings, ...candidate }) => candidate))
      }
      const sharedLocal = api.optimizeScorebook(entries).groups
      const online = await api.buildOnlineScorebook(new AbortController().signal, () => {})
      const music = online.pages.slice(2)
      const sharedOnline = music.map(svg => [...svg.querySelectorAll(':scope > svg')].map(score => score.viewBox.baseVal.width))
      api.parityPlan.entries[0].sharePage = false
      entries[0].sharePage = false
      const soloLocal = api.optimizeScorebook(entries).groups
      const solo = await api.buildOnlineScorebook(new AbortController().signal, () => {})
      const soloOnline = solo.pages.slice(2).map(svg => [...svg.querySelectorAll(':scope > svg')].map(score => score.viewBox.baseVal.width))
      const readerWidths = [], staffWidths = []
      for (const source of sources) {
        const document = api.parseM3NDocument(source)
        readerWidths.push(await api.chooseNumberedScoreWidth(document, { paged: true }))
        const local = await api.staffSearch(source)
        const best = api.chooseBestWidth(local.candidates)
        staffWidths.push({ local: best?.width, reader: await api.chooseStaffScoreWidth(document, { paged: true }),
          candidates: local.candidates.map(candidate => candidate.width) })
      }
      return { productionCandidates: entries.map(entry => entry.candidates.map(({ timings, ...candidate }) => candidate)), auditedEntries, readerWidths, staffWidths, sharedLocal, sharedOnline, soloLocal, soloOnline, sharedPages: online.sharedPages, soloSharedPages: solo.sharedPages }
    }, { sources, plan })
    assert.deepEqual(comparison.productionCandidates, comparison.auditedEntries)
    assert.equal(comparison.sharedPages, 1)
    assert.deepEqual(comparison.sharedOnline, comparison.sharedLocal.map(group => Array(group.end - group.start).fill(group.width)))
    assert.deepEqual(comparison.readerWidths, comparison.soloLocal.map(group => group.width))
    for (const staff of comparison.staffWidths) {
      assert.equal(staff.reader, staff.local)
      assert.deepEqual(staff.candidates, Array.from({ length: 10 }, (_, i) => 540 + i * 20))
    }
    assert.equal(comparison.soloSharedPages, 0)
    assert.deepEqual(comparison.soloOnline, comparison.soloLocal.map(group => Array(group.end - group.start).fill(group.width)))
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
