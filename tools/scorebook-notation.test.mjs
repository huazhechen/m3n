import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { chromium } from '@playwright/test'

test('scorebook uses identical web pages, source equal-measures, credits and bass; A4 only scales the SVG', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-scorebook-'))
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export * from ${JSON.stringify(join(root, 'tools/scorebook-layout.mjs'))}; export {compactPage} from ${JSON.stringify(join(root, 'tools/scorebook-compact-layout.mjs'))}; export {renderScoreInto} from ${JSON.stringify(join(root, 'src/lib/render-score.ts'))}; export {parseM3NDocument, scoreEventIds} from '@m3n/notation'; export {NumberedNotationScore} from ${JSON.stringify(join(root, 'packages/numbered-notation/dist/index.js'))}; export {frameScoreImage} from ${JSON.stringify(join(root, 'packages/score-renderer/src/score-image-frame.ts'))}; export {renderScoreCanvas} from ${JSON.stringify(join(root, 'packages/score-renderer/src/score-export.ts'))};`)
    // The temporary entry resolves package imports through an absolute re-export.
    writeFileSync(entry, readFileSync(entry, 'utf8').replace("from '@m3n/notation'", `from ${JSON.stringify(join(root, 'packages/notation/dist/index.js'))}`))
    await build({ configFile: false, logLevel: 'error', define: { 'import.meta.url': JSON.stringify('http://scorebook.local/bundle.js') }, build: {
      outDir: join(temp, 'bundle'), lib: { entry, name: 'scorebook', formats: ['iife'], fileName: () => 'bundle.js' },
    } })
    browser = await chromium.launch({ executablePath: ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
    const page = await browser.newPage()
    await page.route('**/*', route => new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><style>body{margin:0}</style><div id="scratch"></div><div id="web"></div>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    await page.evaluate(font => window.scorebook.prepare(font), readFileSync(join(root, 'packages/numbered-notation/src/font-assets/NotoSansSC-full.ttf')).toString('base64'))
    const source = '{title=统一排版}{composer=测试作者}{equal-measures=true}{2/4}\nN: ||: 1 2 |\nB: 1d 2d |\nL1: 甲乙\nL2: 戊己\n---V1\nN: 3 4 :||\nB: 3d 4d |\nL: 丙丁\n---V2\nN: (5 6) 7 |||\nB: 3d 4d |\nL: 庚辛壬'
    for (const width of [640, 800]) {
      const result = await page.evaluate(async ({ source, width }) => {
        const api = window.scorebook
        const layout = await api.measure(source, width)
        const original = [...document.querySelectorAll('#scratch > svg')].map(svg => svg.outerHTML)
        const doc = api.parseM3NDocument(source)
        const directHost = document.createElement('div')
        directHost.innerHTML = api.NumberedNotationScore.create(doc).render({ width, paged: true, pageMargin: 0 }).join('')
        const direct = [...directHost.querySelectorAll(':scope > svg')].map(svg => svg.outerHTML)
        const ids = api.scoreEventIds(doc)
        const bassIds = [...doc.parts.values()].flatMap(part => part.bass.flatMap(measure => measure.events.map(event => ids.get(event))))
        const web = document.querySelector('#web')
        await api.renderScoreInto(web, { scoreDocument: api.parseM3NDocument(source), width, paged: true })
        const webPages = [...web.querySelectorAll(':scope > svg')].map(svg => svg.outerHTML)
        const a4 = await api.a4Pages(source, width)
        const parser = new DOMParser()
        const restored = a4.map(({ markup }) => {
          const svg = parser.parseFromString(markup, 'image/svg+xml').documentElement
          const originalSvg = parser.parseFromString(original[0], 'image/svg+xml').documentElement
          for (const key of ['x', 'y', 'width', 'height']) {
            if (originalSvg.hasAttribute(key)) svg.setAttribute(key, originalSvg.getAttribute(key))
            else svg.removeAttribute(key)
          }
          return svg.outerHTML
        })
        const originalXml = original.map(markup => parser.parseFromString(markup, 'image/svg+xml').documentElement.outerHTML)
        const framed = api.frameScoreImage([...web.querySelectorAll(':scope > svg')])
        const image = await api.renderScoreCanvas(framed, framed.viewBox.baseVal.width, 2)
        const imageInfo = { width: framed.viewBox.baseVal.width, height: framed.viewBox.baseVal.height, x: Number(framed.querySelector('svg').getAttribute('x')), y: Number(framed.querySelector('svg').getAttribute('y')), pngWidth: image.width, whiteCorner: [...image.getContext('2d').getImageData(0, 0, 1, 1).data], unchanged: JSON.stringify(webPages) === JSON.stringify([...web.querySelectorAll(':scope > svg')].map(svg => svg.outerHTML)) }
        const compact = api.compactPage(`<svg xmlns="http://www.w3.org/2000/svg" width="793.7007874" height="1122.519685" viewBox="0 0 793.7007874 1122.519685">${a4[0].markup}</svg>`, ['https://score.cheesefans.com/scores/test_01'])
        return { layout, imageInfo, sharedMargin: JSON.stringify(original) === JSON.stringify(direct), equalMeasures: doc.equalMeasures, identical: JSON.stringify(original) === JSON.stringify(webPages), unchanged: JSON.stringify(restored) === JSON.stringify(originalXml),
          placements: a4.map(page => page.placement), credits: web.textContent.includes('测试作者'),
          bass: bassIds.length > 0 && bassIds.every(id => web.querySelector(`[data-m3n-id="${id}"]`)),
          houses: doc.parts.get('score').melody.filter(measure => measure.ending).length,
          compactOutside: compact.outside, glyphs: compact.glyphs, links: compact.links }
      }, { source, width })
      // SVG viewBox uses float32 values; 6% framing produces fractional pixels.
      assert(Math.abs(result.imageInfo.width - width * 1.12) < 1e-4)
      assert.equal(result.imageInfo.x, width * .06)
      assert.equal(result.imageInfo.y, width * .06)
      assert.equal(result.imageInfo.pngWidth, Math.ceil(result.imageInfo.width * 2))
      assert.deepEqual(result.imageInfo.whiteCorner, [255, 255, 255, 255])
      assert(result.imageInfo.unchanged, 'Framing must leave the engraved source untouched')
      assert(result.identical, 'The book must use the exact web SVG')
      assert(result.unchanged, 'A4 may only change the outer placement')
      assert(result.credits)
      assert(result.bass, 'All bass events must remain visible')
      assert(result.equalMeasures, 'Equal measures must come from source syntax')
      assert(result.sharedMargin, 'The shared renderer must use zero page margins')
      assert(result.houses > 0)
      assert.deepEqual(result.layout.outside, [])
      assert.deepEqual(result.layout.overlaps, [])
      assert.deepEqual(result.compactOutside, [])
      assert(result.glyphs > 0)
      assert.equal(result.links.length, 1)
      assert.equal(result.links[0].url, 'https://score.cheesefans.com/scores/test_01')
      assert.equal(result.links[0].label, '统一排版')
      assert(result.links[0].width > 0 && result.links[0].height > 0)
      for (const placement of result.placements) {
        assert(placement.x >= 12 && placement.y === 12)
        assert(placement.width <= 186 && placement.height <= 273)
      }
    }
    const defaults = await page.evaluate(async () => {
      const api = window.scorebook, host = document.querySelector('#web')
      const widths = []
      for (const [prefix, width] of [['', undefined], ['{preferred-width=680}', undefined], ['{preferred-width=680}', 800]]) {
        await api.renderScoreInto(host, { scoreDocument: api.parseM3NDocument(prefix + '{4/4}\nN: 1 2 3 4 |||'), paged: false, width })
        widths.push(host.querySelector('svg').viewBox.baseVal.width)
      }
      return widths
    })
    assert.deepEqual(defaults, [720, 680, 800], 'Source preference supplies the default, while explicit width wins')
    const shared = await page.evaluate(async () => {
      const api = window.scorebook, width = 720
      const sources = ['{title=合页甲}{4/4}\nN: 1 2 3 4 |||', '{title=合页乙}{4/4}\nN: 5 6 7 1 |||']
      const originals = []
      const summary = await api.measure(sources[0], width)
      const packed = await api.sharedA4Page(sources, width)
      for (const source of sources) originals.push((await api.render(source, width, false, packed.coreGap))[0].innerHTML)
      const host = document.createElement('div')
      host.innerHTML = packed.markup
      const svgs = [...host.querySelectorAll(':scope > svg')]
      const compact = api.compactPage(`<svg xmlns="http://www.w3.org/2000/svg" width="793.7007874" height="1122.519685" viewBox="0 0 793.7007874 1122.519685">${packed.markup}</svg>`, ['https://score.cheesefans.com/scores/a', 'https://score.cheesefans.com/scores/b'])
      let overflowRejected = false
      try { await api.sharedA4Page(Array(20).fill(sources[0]), width) } catch { overflowRejected = true }
      return { identical: svgs.map((svg, index) => svg.innerHTML === originals[index]),
        widths: svgs.map(svg => svg.viewBox.baseVal.width), items: packed.items.map(({ top, sourceHeight, placement }) => ({ top, sourceHeight, placement })),
        scoreGap: packed.scoreGap, trailingGap: packed.trailingGap, usedHeight: packed.usedHeight, measuredHeight: summary.naturalHeight, overflowRejected, links: compact.links }
    })
    assert.deepEqual(shared.identical, [true, true], 'Sharing changes only outer SVG placement')
    assert.deepEqual(shared.widths, [720, 720])
    assert(shared.items[0].sourceHeight >= shared.measuredHeight)
    assert.equal(shared.items[1].top, shared.items[0].sourceHeight + shared.scoreGap)
    assert.equal(shared.items[0].placement.width, shared.items[1].placement.width)
    assert(shared.items[1].placement.y + shared.items[1].placement.height <= 285)
    assert(shared.scoreGap > 22)
    assert(Math.abs(shared.usedHeight - Math.floor(720 * 273 / 186)) < 1e-8)
    assert(shared.trailingGap > 0)
    assert(Math.abs(shared.trailingGap - (shared.scoreGap - 22)) < 1e-8)
    const last = shared.items.at(-1)
    assert(Math.abs(last.top + last.sourceHeight + shared.trailingGap - shared.usedHeight) < 1e-8)
    assert(shared.overflowRejected)
    assert.deepEqual(shared.links.map(link => [link.label, link.url]), [['合页甲', 'https://score.cheesefans.com/scores/a'], ['合页乙', 'https://score.cheesefans.com/scores/b']])
    assert(shared.links[1].y > shared.links[0].y, 'Shared titles must link at their own page position')
    const cover = await page.evaluate(() => window.scorebook.compactPage('<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><text x="40" y="100" data-scorebook-url="https://score.cheesefans.com/">访问网站</text></svg>'))
    assert.equal(cover.links[0].url, 'https://score.cheesefans.com/')
    const longSource = '{title=多页测试}{4/4}\nN: ' + Array.from({ length: 100 }, () => '1 2 3 4 |{br}').join(' ')
    const long = await page.evaluate(async source => {
      const summary = await window.scorebook.measure(source, 640)
      const pages = await window.scorebook.a4Pages(source, 640)
      return { ...summary, exported: pages.length }
    }, longSource)
    assert(long.pageCount > 1)
    assert.equal(long.pageCount, long.exported)
    assert.deepEqual(long.outside, [])
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
