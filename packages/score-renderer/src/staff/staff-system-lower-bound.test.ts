import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig, scoreCorePageLowerBound } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { createStaffPreparation } from './staff-engine.js'
import { createStaffMeasureMinimum, planStaffLines } from './line-layout.js'
import { engraveStaffSystems, prepareStaffSystems } from './staff-system.js'
import { paginateStaffBlocks, staffRowBlock } from './staff-row-pagination.js'
import { findAll, hasClass, SvgGeometry, element, xml, type MeasureText } from './layout-svg.js'
import { arrangeStaffSystem } from './system-layout.js'
import { staffSystemLowerBound } from './staff-system-lower-bound.js'

const measure: MeasureText = (text, size) => ({ width: text.length * size / 2, left: 0, right: text.length * size / 2, ascent: size * .8, descent: size * .2 })

it('uses the actual trimmed inline heading displacement for proof spans', () => {
  for (const title of ['ABC', '  ABC  ', '\tABC\n']) {
    const row = element('g', { class: 'system' }, [element('g', { class: 'measure', id: 'm1' }, [
      element('g', { class: 'staff' }, [element('rect', { class: 'staff-line', x: '0', y: '0', width: '1000', height: '80' })]),
      element('g', { class: 'reh' }, [element('text', { x: '0', y: '0', 'font-size': '30' }, [title])]),
      element('g', { class: 'dir' }, [element('text', { x: '10', y: '0', 'font-size': '30' }, ['D'])]),
    ])])
    const lower = staffSystemLowerBound(row, measure, 600, new Set(), 12).lowerBoundGeometry!
    const exact = arrangeStaffSystem(row, new SvgGeometry(row, measure, true), 600, new Set(), false, false, 12)
    for (const [pieces, edge] of [[lower.topInk, 'top'], [lower.bottomInk, 'bottom']] as const)
      for (const piece of pieces) expect(exact.spacingPieces.some(actual => actual.left <= piece.left && actual.right >= piece.right
        && (edge === 'top' ? actual.top <= piece.top : actual.bottom >= piece.bottom)), `${title}: ${JSON.stringify(piece)}`).toBe(true)
  }
})

it.each(['ban_yin_jie_kou_qin_ji_ben_gong_01', 'meng_huan_qu_01', 'flower_dance_01', 'hei_se_you_mo_01', 'ai_ru_chao_shui_01', 'hei_se_you_mo_01', 'ai_ru_chao_shui_01'])('each directional constraint belongs to exact row ink: %s', name => {
  const source = readFileSync(new URL(`../../../../src/scores/${name}.m3n`, import.meta.url), 'utf8')
  const doc = projectStaffDocument(analyzeM3N(source).score)
  expect(doc.hasBass).toBe(false)
  const preparation = createStaffPreparation(doc)
  const minimum = createStaffMeasureMinimum(false, measure, preparation)
  for (const width of [528, 618, 720]) for (const spacing of [.6, 1.2, 1.8]) {
    const lines = planStaffLines(doc, width, false, measure, spacing, minimum)
    const staged = prepareStaffSystems(doc, lines, width, measure, spacing, false, 1, preparation)
    const bounds = staged.map(row => row.lowerBound)
    const systems = engraveStaffSystems(doc, lines, width, measure, spacing, false, 1, preparation, undefined, undefined, true, false)
    // Suspended rows must own their anchors: another prepared width may reuse
    // the engine's private placement workspace before these rows resume.
    const otherLines = planStaffLines(doc, width + 137, false, measure, spacing + .17, minimum)
    prepareStaffSystems(doc, otherLines, width + 137, measure, spacing + .17, false, 1, preparation)
    bounds.forEach((block, row) => {
      const exact = systems[row]!, lower = block.lowerBoundGeometry!
      const scalar = (block as ReturnType<typeof staffSystemLowerBound>).invariantHeightLowerBound
      expect(scalar, `height row ${row}`).toBeLessThanOrEqual(exact.ink.bottom - exact.ink.top + 1e-10)
      const resumed = staged[row]!.complete()
      expect(staged[row]!.complete()).toBe(resumed)
      expect(resumed.pieces).toEqual(exact.pieces)
      expect(resumed.core).toEqual(exact.core)
      expect(xml(resumed.node)).toBe(xml(exact.node))
      expect(lower.top, `top row ${row}`).toBeGreaterThanOrEqual(exact.ink.top - 1e-8)
      expect(lower.bottom, `bottom row ${row}`).toBeLessThanOrEqual(exact.ink.bottom + 1e-8)
      for (const [channel, field, compare] of [
        [lower.topInk, 'top', (actual: number, bound: number) => actual <= bound + 1e-8],
        [lower.bottomInk, 'bottom', (actual: number, bound: number) => actual >= bound - 1e-8],
      ] as const) for (const piece of channel) {
        expect(exact.spacingPieces.some(actual => actual.left <= piece.left + 1e-8 && actual.right >= piece.right - 1e-8
          && compare(actual[field], piece[field])), `${field} row ${row}: ${JSON.stringify(piece)}`).toBe(true)
      }
    })
  }
})

it.each([false, true])('single-staff attachment bounds fit within exact geometry (below=%s)', below => {
  for (const kind of ['dir', 'harm', 'fing', 'dynam', 'tempo', 'repeatMark', 'octave']) {
    const raw = element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
      element('g', { class: 'staff' }, [element('rect', { class: 'staff-line', x: '0', y: '0', width: '1000', height: '80' })]),
      ...[10, 15, 70].map(x => element('g', { class: kind, 'data-m3n-below': String(below) }, [
        element('text', { x: String(x), y: '0', 'font-size': '30' }, ['ABC']),
      ])),
    ])])
    const bound = staffSystemLowerBound(raw, measure, 600, new Set(), 12).lowerBoundGeometry!
    const actual = arrangeStaffSystem(raw, new SvgGeometry(raw, measure, true), 600, new Set(), false)
    expect(bound.top).toBeGreaterThanOrEqual(actual.ink.top - 1e-8)
    expect(bound.bottom).toBeLessThanOrEqual(actual.ink.bottom + 1e-8)
    // Confirm the test actually exercises movement rather than empty ink.
    expect(findAll(raw, n => hasClass(n, kind)).some(n => n.attributes.transform)).toBe(true)
  }
})

it.each([
  '{key=F}{3/4}\nN: {lg}([3 4 3:2]){/} 6. (3) | 1 2 3 | 4 5 6 |',
  '{4/4}\nN: 1 2 3 4 | 5 6 7 1\' | 1 2 3 4 | 5 6 7 1\' |',
  '{4/4}\nN: {lg}1 2 3 4 | 5 6 7 1e | 2e 3e 4e 5e{/} |||\nL: 春夏秋冬山川天地春夏秋冬',
])('pre-avoidance bounds never require more pages than complete rows: %s', source => {
  const doc = projectStaffDocument(analyzeM3N(source).score)
  const preparation = createStaffPreparation(doc), minimum = createStaffMeasureMinimum(false, measure, preparation)
  for (const width of [180, 300, 600]) for (const spacing of [.6, 1.2, 1.8]) {
    const lines = planStaffLines(doc, width, false, measure, spacing, minimum)
    const pending = prepareStaffSystems(doc, lines, width, measure, spacing, false, 1, preparation)
    const lower = pending.map(row => row.lowerBound)
    const systems = engraveStaffSystems(doc, lines, width, measure, spacing, false, 1, preparation, undefined, undefined, true, false)
    expect(pending.map(row => xml(row.complete().node))).toEqual(systems.map(row => xml(row.node)))
    const actual = systems.map((row, index) => staffRowBlock(row, index, 24))
    for (const height of [250, 400, 800]) {
      const pages = paginateStaffBlocks(actual, height, 24, true, 24).heights.length
      expect(scoreCorePageLowerBound(lower, { pageHeight: height, margin: 10, gap: 24, headerGap: 16, directional: true })).toBeLessThanOrEqual(pages)
    }
  }
})

// These examples flip a flexible beam only after full attachment avoidance.
// The paused layout must make the same choices, and its proof cannot retain
// the initial stem/beam edge when that edge disappears after a flip.
it.each([
  '{2/4}\nN: 1ee ((3 2e 2e 2e)) |',
  '{2/4}\nN: 1d ((5 2e 5 5)) |',
  '{3/4}\nN: 1ee ((7 1e 7 1e)) 1d |\nL: 啊 啊 啊 啊 啊 啊',
])('staged bounds survive flexible beam direction refinement: %s', source => {
  const previous = scoreLayoutConfig.staff.reuseBeamOuterSpace
  scoreLayoutConfig.staff.reuseBeamOuterSpace = true
  try {
    const doc = projectStaffDocument(analyzeM3N(source).score)
    const preparation = createStaffPreparation(doc), minimum = createStaffMeasureMinimum(false, measure, preparation)
    const lines = planStaffLines(doc, 640, false, measure, .8, minimum)
    const staged = prepareStaffSystems(doc, lines, 640, measure, .8, false, 1, preparation)
    const exact = engraveStaffSystems(doc, lines, 640, measure, .8, false, 1, preparation, undefined, undefined, true, false)
    expect(exact.some(row => Number(row.node.attributes['data-m3n-beam-flips']) > 0)).toBe(true)
    staged.forEach((row, index) => {
      const result = row.complete(), actual = exact[index]!, lower = row.lowerBound.lowerBoundGeometry!
      expect(xml(result.node)).toBe(xml(actual.node))
      expect(result.pieces).toEqual(actual.pieces)
      expect(result.spacingPieces).toEqual(actual.spacingPieces)
      expect(lower.top).toBeGreaterThanOrEqual(actual.ink.top - 1e-8)
      expect(lower.bottom).toBeLessThanOrEqual(actual.ink.bottom + 1e-8)
      for (const [pieces, field] of [[lower.topInk, 'top'], [lower.bottomInk, 'bottom']] as const)
        for (const piece of pieces) expect(actual.spacingPieces.some(ink => ink.left <= piece.left + 1e-8 && ink.right >= piece.right - 1e-8
          && (field === 'top' ? ink.top <= piece.top + 1e-8 : ink.bottom >= piece.bottom - 1e-8))).toBe(true)
    })
  } finally { scoreLayoutConfig.staff.reuseBeamOuterSpace = previous }
})


it('bounds sparse lyric rows by local music without retaining their initial baselines', () => {
  let height: number | undefined
  for (const initialY of [-1000, 0, 1000]) {
    const make = () => element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
      element('g', { class: 'staff', 'data-staff': 'melody' }, [
        element('rect', { class: 'staff-line', width: '1000', height: '30' }),
        element('rect', { x: '10', y: '40', width: '50', height: '6' }),
        element('rect', { x: '800', y: '500', width: '10', height: '5' }),
        ...[['first-v2', 10, 15, '春'], ['other-v2', 30, 20, '夏'], ['last-v4', 15, 10, '秋'], ['empty-v1', 0, 40, ' \u200B\u2800']].map(([id, x, size, value]) =>
          element('g', { class: 'verse', id: String(id) }, [element('text', {
            x: String(x), y: String(initialY), 'font-size': String(size),
          }, [String(value)])])),
      ]),
    ])])
    const node = make(), bound = staffSystemLowerBound(node, measure, 600, new Set(), 12)
    const exactNode = make()
    const exact = arrangeStaffSystem(exactNode, new SvgGeometry(exactNode, measure, true), 600, new Set(), false, false, 12)
    const lower = bound.lowerBoundGeometry!
    expect(lower.bottom).toBeLessThanOrEqual(exact.ink.bottom + 1e-8)
    // The isolated low note affects the total row height, but must not put
    // every lyric at y=500. Their local baseline follows the nearby music.
    const lyrics = lower.bottomInk.filter(piece => piece.left > 0 && piece.left < 20 && piece.bottom > 30 && piece.bottom < 200)
    expect(lyrics.length).toBeGreaterThan(1)
    for (const piece of lower.bottomInk) expect(exact.spacingPieces.some(actual => actual.left <= piece.left + 1e-8
      && actual.right >= piece.right - 1e-8 && actual.bottom >= piece.bottom - 1e-8)).toBe(true)
    height ??= bound.invariantHeightLowerBound
    expect(bound.invariantHeightLowerBound).toBeCloseTo(height, 8)
    expect(bound.invariantHeightLowerBound).toBeLessThanOrEqual(exact.ink.bottom - exact.ink.top + 1e-8)
  }
})


it('does not create a lyric row from cached text on an empty verse container', () => {
  const make = (cached: boolean) => element('g', { class: 'system' }, [element('g', { class: 'measure' }, [
    element('g', { class: 'staff' }, [
      element('rect', { class: 'staff-line', width: '1000', height: '30' }),
      { ...element('g', { class: 'verse', id: 'empty-v1' }), ...(cached ? { textValue: 'cached' } : {}) },
      element('g', { class: 'verse', id: 'visible-v2' }, [element('text', { x: '10', 'font-size': '20' }, ['春'])]),
    ]),
  ])])
  const actualNode = make(true), actual = arrangeStaffSystem(actualNode, new SvgGeometry(actualNode, measure, true), 600, new Set())
  const bound = staffSystemLowerBound(make(true), measure, 600, new Set(), 12)
  expect(bound).toEqual(staffSystemLowerBound(make(false), measure, 600, new Set(), 12))
  expect(bound.lowerBoundGeometry!.bottom).toBeLessThanOrEqual(actual.ink.bottom + 1e-8)
})
