import { chromiumLaunchOptions } from './lib/chromium-options.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildBrowserTestBundle } from './lib/browser-test-bundle.mjs'
import { chromium } from '@playwright/test'
import { browserTestFontAssets } from './lib/browser-test-font-assets.mjs'
import { execFileSync } from 'node:child_process'

test('scorebook uses identical web pages, source equal-measures, credits and bass; A4 only scales the SVG', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-scorebook-'))
  const fontAssets = browserTestFontAssets(root, { fontFile: join(temp, 'bundle/fixture-font.ttf') })
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export {inspectScorePages} from ${JSON.stringify(join(root, 'tools/lib/score-geometry.mjs'))}; export * from ${JSON.stringify(join(root, 'tools/scorebook-layout.mjs'))}; export {compactPage} from ${JSON.stringify(join(root, 'tools/scorebook-compact-layout.mjs'))}; export {renderScoreInto} from ${JSON.stringify(join(root, 'src/lib/render-score.ts'))}; export {describeAccessibleScore} from ${JSON.stringify(join(root, 'src/lib/score-accessibility.ts'))}; export {attachScoreReading} from ${JSON.stringify(join(root, 'src/lib/score-reading-dom.ts'))}; export {parseM3NDocument, scoreEventIds} from '@m3n/notation'; export {NumberedNotationScore} from ${JSON.stringify(join(root, 'packages/numbered-notation/dist/index.js'))}; export {frameScoreImage} from ${JSON.stringify(join(root, 'packages/score-renderer/src/score-image-frame.ts'))}; export {renderScoreCanvas} from ${JSON.stringify(join(root, 'packages/score-renderer/src/score-export.ts'))};`)
    // The temporary entry resolves package imports through an absolute re-export.
    writeFileSync(entry, readFileSync(entry, 'utf8').replace("from '@m3n/notation'", `from ${JSON.stringify(join(root, 'packages/notation/dist/index.js'))}`))
    await buildBrowserTestBundle({ root, entry, outDir: join(temp, 'bundle') })
    execFileSync(process.execPath, [join(root, 'tools/prepare-builtin-pdf-font.mjs')], { stdio: 'ignore' })
    browser = await chromium.launch(chromiumLaunchOptions())
    const page = await browser.newPage()
    await page.route('**/*', async route => await fontAssets.fulfill(route) ? undefined : new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><style>body{margin:0}</style><div id="scratch"></div><div id="web"></div>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    await page.evaluate(() => window.scorebook.prepare())
    await fontAssets.prepareBookFont(page)
    const fontStability = await page.evaluate(async ({ source, shared }) => {
      const before = await window.scorebook.auditWidth(source, 570)
      await window.scorebook.sharedA4Page(shared, 630, 32)
      const after = await window.scorebook.auditWidth(source, 570)
      const exported = await window.scorebook.a4Pages(source, 570)
      return { before: before.pageCount, after: after.pageCount, rowsBefore: before.rows, rowsAfter: after.rows, exported: exported.length }
    }, { source: readFileSync(join(root, 'src/scores/bei_jia_er_hu_pan_01.m3n'), 'utf8'),
      // These shorter scores still share an A4 page with the 24px typography.
      shared: ['xiao_xing_xing_01.m3n', 'hong_he_gu_01.m3n'].map(file => readFileSync(join(root, 'src/scores', file), 'utf8')) })
    assert(fontStability.before > 0 && fontStability.rowsBefore > 0)
    assert.equal(fontStability.after, fontStability.before, 'Shared rendering must preserve the measured per-score font selection')
    assert.equal(fontStability.rowsAfter, fontStability.rowsBefore, 'Later font preparation must preserve line breaks')
    assert.equal(fontStability.exported, fontStability.before, 'Export must preserve the measured page count')
    const source = '{title=统一排版}{composer=测试作者}{equal-measures=true}{2/4}\nN: ||: 1 2 |\nB: 1d 2d |\nL1: 甲乙\nL2: 戊己\n---V1\nN: 3 4 :||\nB: 3d 4d |\nL: 丙丁\n---V2\nN: (5 6) 7 |||\nB: 3d 4d |\nL: 庚辛壬'
    for (const width of [640, 800]) {
      const result = await page.evaluate(async ({ source, width }) => {
        const api = window.scorebook
        const layout = await api.auditWidth(source, width)
        const original = [...document.querySelectorAll('#scratch > svg')].map(svg => svg.outerHTML)
        const doc = api.parseM3NDocument(source)
        const directHost = document.createElement('div')
        directHost.innerHTML = api.NumberedNotationScore.create(doc).render({ width, paged: true, pageMargin: 0 }).join('')
        document.body.append(directHost)
        api.attachScoreReading(directHost, api.describeAccessibleScore(doc, { forDisplay: true }))
        const direct = [...directHost.querySelectorAll(':scope > svg')].map(svg => svg.outerHTML)
        directHost.remove()
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
        const visualMarkup = markup => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.innerHTML = markup
          svg.querySelectorAll('[data-score-reading], [data-score-reading-hitarea]').forEach(node => node.remove())
          for (const node of svg.querySelectorAll('*')) for (const attribute of [...node.attributes])
            if (attribute.name.startsWith('aria-') || ['role', 'tabindex'].includes(attribute.name) || attribute.name.startsWith('data-reading-')) node.removeAttribute(attribute.name)
          return svg.innerHTML
        }
        return { layout, imageInfo, sharedMargin: original.map(visualMarkup).join() === direct.map(visualMarkup).join(), equalMeasures: doc.equalMeasures, identical: JSON.stringify(original) === JSON.stringify(webPages), unchanged: restored.map(visualMarkup).join() === originalXml.map(visualMarkup).join(),
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
    assert.deepEqual(defaults, [720, 720, 800], 'Removed source width fields are ignored, while explicit render width wins')
    const shared = await page.evaluate(async () => {
      const api = window.scorebook, width = 720
      const sources = ['{title=合页甲}{4/4}\nN: 1 2 3 4 |||', '{title=合页乙}{4/4}\nN: 5 6 7 1 |||']
      const visualMarkup = (markup) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.innerHTML = markup
        svg.querySelectorAll('[data-score-reading], [data-score-reading-hitarea]').forEach(node => node.remove())
        for (const node of svg.querySelectorAll('*')) for (const attribute of [...node.attributes])
          if (attribute.name.startsWith('aria-') || ['role', 'tabindex'].includes(attribute.name) || attribute.name.startsWith('data-reading-')) node.removeAttribute(attribute.name)
        return svg.innerHTML
      }
      const originals = []
      const summary = await api.auditWidth(sources[0], width)
      const packed = await api.sharedA4Page(sources, width)
      for (const source of sources) originals.push((await api.render(source, width, false, packed.coreGap))[0].innerHTML)
      const host = document.createElement('div')
      host.innerHTML = packed.markup
      const svgs = [...host.querySelectorAll(':scope > svg')]
      const compact = api.compactPage(`<svg xmlns="http://www.w3.org/2000/svg" width="793.7007874" height="1122.519685" viewBox="0 0 793.7007874 1122.519685">${packed.markup}</svg>`, ['https://score.cheesefans.com/scores/a', 'https://score.cheesefans.com/scores/b'])
      let overflowRejected = false
      try { await api.sharedA4Page(Array(20).fill(sources[0]), width) } catch { overflowRejected = true }
      return { identical: svgs.map((svg, index) => visualMarkup(svg.innerHTML) === visualMarkup(originals[index])),
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
    // Transparent reading hit areas must not become false ink. Visible strokes,
    // vertical clipping and overlapping note / lyric text must still fail.
    const geometry = await page.evaluate(() => {
      const host = document.createElement('div')
      document.body.append(host)
      const inspect = content => {
        host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`
        return window.scorebook.inspectScorePages([...host.querySelectorAll('svg')])
      }
      const transparent = inspect('<rect x="-2" y="-2" width="104" height="104" fill="transparent"/>')
      const horizontal = inspect('<rect x="-2" y="10" width="20" height="20" fill="black"/>')
      const vertical = inspect('<g class="system"><rect x="10" y="-2" width="20" height="20" fill="black"/></g>')
      const strokeEdge = inspect('<line x1="0" y1="10" x2="0" y2="20" stroke="black" stroke-width="1.21"/>')
      const above = inspect('<text x="10" y="-20" data-m3n-role="measure-number">82</text>')
      const tiny = inspect('<rect x="-0.001" y="10" width="10" height="10" fill="black"/>')
      const below = inspect('<rect x="10" y="110" width="10" height="10" fill="black"/>')
      const collision = inspect('<g class="system"><g class="note"><text x="20" y="40">1</text></g><text data-m3n-role="lyric" x="20" y="40">甲</text></g>')
      host.remove()
      return { transparent, horizontal, vertical, collision, strokeEdge, above, below, tiny }
    })
    assert.deepEqual(geometry.transparent, { outside: [], overlaps: [] })
    assert.equal(geometry.horizontal.outside.length, 1)
    assert.equal(geometry.vertical.outside.length, 1)
    assert.equal(geometry.collision.overlaps.length, 1)
    for (const key of ['strokeEdge', 'above', 'below', 'tiny']) assert.equal(geometry[key].outside.length, 1, key)
    const basics = readFileSync(join(root, 'src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const basicsLayout = await page.evaluate(source => window.scorebook.auditWidth(source, 590), basics)
    assert.equal(basicsLayout.pageCount, 3)
    assert.deepEqual(basicsLayout.outside, [])
    assert.deepEqual(basicsLayout.overlaps, [])
    for (const width of [580, 720]) {
      const numbered = await page.evaluate(async ({ source, width }) => {
        await window.scorebook.auditWidth(source, width)
        const host = document.querySelector('#scratch')
        host.innerHTML = window.scorebook.NumberedNotationScore.create(window.scorebook.parseM3NDocument(source))
          .render({ width, paged: true, pageMargin: 0, measureNumbers: true }).join('')
        return window.scorebook.inspectScorePages([...host.querySelectorAll(':scope > svg')])
      }, { source: basics, width })
      assert.deepEqual(numbered.outside, [], `${width}px: tuplets and page-opening measure numbers must stay inside the page`)
    }
    const longSource = '{title=多页测试}{4/4}\nN: ' + Array.from({ length: 100 }, () => '1 2 3 4 |{br}').join(' ')
    const long = await page.evaluate(async source => {
      const summary = await window.scorebook.auditWidth(source, 640)
      const pages = await window.scorebook.a4Pages(source, 640)
      return { ...summary, exported: pages.length }
    }, longSource)
    assert(long.pageCount > 1)
    assert.equal(long.pageCount, long.exported)
    assert.deepEqual(long.outside, [])

    // A fresh browser reproduces the book's real loading order. Overlapping
    // CJK subsets must all be installed before measuring the opening work.
    await page.reload()
    await page.requestGC()
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    await fontAssets.prepareBookFont(page)
    const bookSources = JSON.parse(readFileSync(join(root, 'config/scorebook/editorial-plan.json'), 'utf8')).entries
      .map(entry => readFileSync(join(root, 'src/scores', entry.file), 'utf8'))
    const annie = await page.evaluate(async ({ sources, source }) => {
      const api = window.scorebook
      await api.prepareSources(sources)
      const production = await api.measure(source, 620)
      const paged = await api.auditWidth(source, 620)
      const continuous = await api.auditWidth(source, 620, false)
      const exported = await api.a4Pages(source, 620)
      return { production, paged, continuous, exported: exported.length }
    }, { sources: bookSources, source: readFileSync(join(root, 'src/scores/annie_01.m3n'), 'utf8') })
    for (const layout of [annie.paged, annie.continuous]) {
      assert.deepEqual(layout.outside, [], 'Annie at 620px must reserve wrapped instrumental parentheses')
      assert.deepEqual(layout.overlaps, [])
    }
    assert.equal(annie.production.pageCount, annie.paged.pageCount)
    assert.equal(annie.production.rows, annie.paged.rows)
    assert.equal(annie.exported, annie.paged.pageCount)
    const valsentino = await page.evaluate(async source => {
      const api = window.scorebook
      const production = await api.measure(source, 480)
      const paged = await api.auditWidth(source, 480)
      const continuous = await api.auditWidth(source, 480, false)
      const exported = await api.a4Pages(source, 480)
      return { production, paged, continuous, exported: exported.length }
    }, readFileSync(join(root, 'src/scores/valsentino_01.m3n'), 'utf8'))
    for (const layout of [valsentino.paged, valsentino.continuous]) {
      assert.deepEqual(layout.outside, [], 'Valsentino at 480px must reserve the closing bar restored before a repeat opening')
      assert.deepEqual(layout.overlaps, [])
    }
    assert.equal(valsentino.production.pageCount, valsentino.paged.pageCount)
    assert.equal(valsentino.production.rows, valsentino.paged.rows)
    assert.equal(valsentino.exported, valsentino.paged.pageCount)
    const accidentals = await page.evaluate(async () => {
      const results = []
      for (const note of ['1b', '1#', '1=', '1bb', '1##', '[1 3bb 5:h]']) {
        const source = `{title=Test}{4/4}\nN: ${note} 2 3 4 |||`
        for (const paged of [true, false]) {
          const layout = await window.scorebook.auditWidth(source, 480, paged)
          results.push({ note, paged, outside: layout.outside, overlaps: layout.overlaps })
        }
      }
      return results
    })
    for (const { note, paged, outside, overlaps } of accidentals) {
      assert.deepEqual(outside, [], `${note} must reserve its painted accidental at the left edge (paged=${paged})`)
      assert.deepEqual(overlaps, [], `${note} must preserve measured clearance (paged=${paged})`)
    }
    const symbolSource = '{title=Symbols}{key=Db}{4/4}{order=A,B}\n===A\nN: ||: '
      + ['ppp','pp','p','mp','mf','f','ff','fff','sfz'].map((dynamic,index) =>
        `{${dynamic}}${index === 0 ? '{segno}' : index === 1 ? '{coda}' : ''}1e${index === 0 ? '{fermata}{tr}{prall}{str}{tip}{brk}{hold}{breath}' : ''} (2e) [1d3e5ee:h]${index === 0 ? '{arp}{ac(2d3e)}' : ''} 4. ${index === 8 ? ':||' : '|'}`).join(' ')
      + '\nB: ' + Array(9).fill('1dd 2d 3d 4d |').join(' ') + '\n===B\nN: 1 2 3 4 |||'
    const symbols = await page.evaluate(async source => {
      const api = window.scorebook, layout = await api.auditWidth(source,640)
      const nodes = [...document.querySelectorAll('#scratch text[data-m3n-font="Bravura"]')]
      const characters = [...new Set(nodes.map(node=>node.textContent))]
      const arrow = document.querySelector('#scratch text[data-m3n-role="order-arrow"]')?.textContent
      const framed = api.frameScoreImage([...document.querySelectorAll('#scratch > svg')])
      const image = await api.renderScoreCanvas(framed,framed.viewBox.baseVal.width,1)
      const dotDiameters = [...document.querySelectorAll('#scratch circle[data-m3n-role="music-dot"]')].map(node => 2 * Number(node.getAttribute('r')))
      return {layout,characters,arrow,dotDiameters,png:image.toDataURL().length}
    },symbolSource)
    assert.deepEqual(symbols.layout.outside,[])
    assert.deepEqual(symbols.layout.overlaps,[])
    for (const [name, {character}] of Object.entries(JSON.parse(readFileSync(join(root,'packages/numbered-notation/src/bravura-symbols.json'),'utf8')))) {
      // Numbered octave and duration dots deliberately use native circles.
      if (name !== 'augmentationDot') assert(symbols.characters.includes(character),`The browser must render music character ${character.codePointAt(0).toString(16)}`)
    }
    for (const diameter of [3.6, 4.32]) assert(symbols.dotDiameters.some(value => Math.abs(value - diameter) < 1e-6), `Music dots must retain their ${diameter}px circle diameter`)
    assert.equal(symbols.arrow,'→')
    assert(symbols.png > 1000,'All transformed music characters must export to PNG')
    const paperInk = await page.evaluate(() => {
      const markup = x => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><text x="0" y="0" font-size="1000" font-family="Bravura" transform="matrix(.03 0 0 .03 ${x} 95)">\uE1E7</text></svg>`
      return {inside:window.scorebook.compactPage(markup(90)).outside,outside:window.scorebook.compactPage(markup(110)).outside}
    })
    assert.deepEqual(paperInk.inside,[],'A scaled font line box must not cause a painted-ink false positive')
    assert.equal(paperInk.outside.length,1,'The same glyph must still fail when its painted ink crosses the paper edge')

    const stable = await page.evaluate(async ({ sources, basics }) => {
      const api = window.scorebook
      await api.prepareSources(sources)
      const results = []
      for (const width of [540, 640, 720]) {
        const before = await api.measure(basics, width)
        await api.prepareSources([...sources].reverse())
        const after = await api.auditWidth(basics, width)
        const exported = await api.a4Pages(basics, width)
        results.push({ width, before: before.pageCount, after: after.pageCount, exported: exported.length, rowsBefore: before.rows, rowsAfter: after.rows })
      }
      return results
    }, { sources: bookSources, basics })
    for (const result of stable) {
      assert.equal(result.before, result.after, `${result.width}px: later font preparation must preserve measured pages`)
      assert.equal(result.before, result.exported, `${result.width}px: final rendering must match measurement`)
      assert.equal(result.rowsBefore, result.rowsAfter)
    }
    assert.equal(stable.at(-1).exported, 2, 'The 720px opening work uses the fully prepared book fonts')
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
