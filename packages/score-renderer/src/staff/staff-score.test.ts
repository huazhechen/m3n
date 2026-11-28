import { scorePageCost } from '@m3n/numbered-notation/layout-quality'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
// jsdom has no SVG character-position API; compare engraving before browser
// text resolution here. Full PDF parity covers real browser text placement.
vi.mock('./svg-text.js', () => ({ resolveStaffText: vi.fn() }))
import { planScoreTier, scorePhysicalSpacing, scoreLayoutConfig, withScoreWidthCandidatePolicy } from '@m3n/numbered-notation/layout'
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasureMinimum, planStaffLines, prepareStaffLineGraph } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { textMeasurer, xml } from './layout-svg.js'

it('prepares exact staff plans before engraving and preserves full geometry under delayed completion', async () => {
  const score = analyzeM3N(readFileSync(resolve(import.meta.dirname, '../../../../src/scores/bai_hua_lin_01.m3n'), 'utf8')).score
  const render = await prepareStaffScore(score, { width: 606 })
  const lower = render.prepareMeasurement().lowerBound
  const expected = await prepareStaffScore(score, { width: 606 })
  const info = render.measurementInfo(), reference = expected.measurementInfo()
  expect(info).toEqual(reference)
  expect(lower).toBeLessThanOrEqual(info.quality.totalCost + scorePageCost(info.pageCount) + 1e-8)
  expect(render.layoutInfo()).toEqual(expected.layoutInfo())
  expect(render(true).map(svg => svg.outerHTML)).toEqual(expected(true).map(svg => svg.outerHTML))
})

describe('staff page packing', () => {
  it('keeps cross-row relations when outside rows supply topology without spacing', () => {
    const score = analyzeM3N('{4/4}\nN: (1 2 3 4 | 5 6 7 1e | 2e 3e 4e 5e) |||').score
    const projected = projectStaffDocument(score), measure = textMeasurer()
    const graph = prepareStaffLineGraph(projected, 600, false, measure, .6)
    const lines = graph.makeLines([1, 2, 3], false)
    const expected = engraveStaffSystems(projected, lines, 600, measure, .6, false)
    for (let row = 0; row < 3; row++) {
      const eventMeasures = new Map<string, number>()
      graph.measured.forEach((member, index) => {
        for (const lane of [member.measure.melody, member.measure.bass]) for (const event of lane) {
          eventMeasures.set(event.id, index)
          for (const child of event.children ?? []) eventMeasures.set(child.id, index)
        }
      })
      const line = graph.makeLines([row + 1], false, row, false)[0]!
      const actual = engraveStaffSystems(projected, [line], 600, measure, .6, false, 1, undefined, 0,
        id => { const index = eventMeasures.get(id); return index === undefined ? undefined : index < row ? -1 : index > row ? 1 : 0 }, true)[0]!
      expect(actual.ink).toEqual(expected[row]!.ink)
      expect(actual.materializeInk).toBeTypeOf('function')
      actual.materializeInk?.()
      expect(actual.materializeInk).toBeUndefined()
      expect(actual.pieces).toEqual(expected[row]!.pieces)
      expect(actual.spacingPieces).toEqual(expected[row]!.spacingPieces)
      expect(actual.edgePieces).toEqual(expected[row]!.edgePieces)
      expect(xml(actual.node)).toBe(xml(expected[row]!.node))
    }
  })
  it('reuses engraving across gap fits with the same geometry and SVG as fresh layouts', async () => {
    // Long-score width retention is covered below. This small polyphonic
    // fixture isolates gap reuse, lyrics and a relation spanning both rows.
    const score = analyzeM3N('{4/4}\nN: {lg}1 2 3 4 | 5 6 7 1e |{br} 2e 3e 4e 5e | 6e 7e 1ee 2ee{/} |||\nB: 1d^ 5d^ | 5d^ 1^ | 1d^ 5d^ | 5d^ 1^ |\nL: 春夏秋冬山川天地春夏秋冬山川天地').score
    const shared = await prepareStaffScore(score, { width: 550, coreGap: 20 })
    expect(shared.measurementInfo().rows).toBeGreaterThan(1)
    shared.pageCount(true)
    shared.continuousHeight()
    for (const gap of [20, 48, 32, 20]) {
      const fresh = await prepareStaffScore(score, { width: 550, coreGap: gap })
      expect(shared.continuousHeight(gap)).toBe(fresh.continuousHeight())
      for (const paged of [false, true]) {
        expect(shared(paged, gap).map(svg => svg.outerHTML)).toEqual(fresh(paged).map(svg => svg.outerHTML))
      }
    }
    for (const gap of [-1, NaN, Infinity]) {
      expect(() => shared.continuousHeight(gap)).toThrow('行距无效')
      expect(() => shared(false, gap)).toThrow('行距无效')
    }
  })

  it('compares all minimum tiers using the same physical spacing objective', async () => {
    const score = analyzeM3N(readFileSync(resolve(import.meta.dirname, '../../../../src/scores/mo_li_hua_01.m3n'), 'utf8')).score
    const info = (await prepareStaffScore(score, { width: 768 })).layoutInfo()
    expect(info.pageCount).toBe(1)
    for (const spacing of scoreLayoutConfig.staff.noteGapCandidates) {
      const graph = prepareStaffLineGraph(projectStaffDocument(score), 768 - scoreLayoutConfig.staff.singleGutter - scoreLayoutConfig.staff.rightGutter, false, textMeasurer(), spacing)
      const ends = planScoreTier(graph.candidates, spacing === scoreLayoutConfig.staff.noteGapCandidates.at(-1) ? .5 : 2/3)
      if (!ends) continue
      const lines = graph.makeLines(ends)
      const space = scoreLayoutConfig.staff.music / 4
      const quality = scorePhysicalSpacing(lines.flatMap(line => line.rhythmicGaps ?? []), space * scoreLayoutConfig.staff.noteGapCandidates.at(-1)!, space * scoreLayoutConfig.staff.noteGapCandidates[0]!,
        lines.flatMap(line => line.unitRhythmicGap === undefined ? [] : [line.unitRhythmicGap]), scoreLayoutConfig.staff.horizontalComfort)
      expect(info.quality.spacingCost).toBeLessThanOrEqual(quality.spacingCost + 1e-9)
    }
  })

  it('uses the loose tier when every candidate has the same physical spacing quality', async () => {
    const score = analyzeM3N('{4/4}\nN: 1^^ |||').score
    // No real interval: all tiers have exactly zero spacing cost.
    for (const part of score.parts.values()) part.melody[0]!.right = 'invis'
    const render = await prepareStaffScore(score, { width: 640 })
    const info = render.layoutInfo()
    expect(info.pageCount).toBe(1)
    expect(info.lines).toHaveLength(1)
    expect(info.quality.lineDensityVariation).toBe(0)
    expect(info.quality.lastLineSlack).toBe(0)
    expect(info.spacing).toBe(scoreLayoutConfig.staff.noteGapCandidates.at(-1))
    expect(render.pageCount(false)).toBe(1)
    expect(render.pageCount(true)).toBe(1)
  })

  it('engraves internal tuplet ties with lyrics on their starting notes', async () => {
    const score = analyzeM3N('{2/4}\nN: ([3~ 3 3:2]) ([5 5~ 5:2]) |||\nL: 春夏秋冬').score
    const projected = projectStaffDocument(score), measure = textMeasurer()
    const lines = planStaffLines(projected, 600, false, measure, 0.25)
    const markup = engraveStaffSystems(projected, lines, 600, measure, 0.25, false).map(system => xml(system.node)).join('')
    expect(markup.match(/class="tie"/g)).toHaveLength(2)
    const holder = document.createElement('div')
    holder.innerHTML = markup
    expect(holder.querySelector('#m3n-e-1-n1-v1')?.textContent).toBe('春')
    expect(holder.querySelector('#m3n-e-1-n1-v1')?.getAttribute('data-m3n-tuplet-slot')).toBe('0')
    expect(holder.querySelector('#m3n-e-1-n3-v1')?.getAttribute('data-m3n-tuplet-slot')).toBe('2')
    expect(holder.querySelector('#m3n-e-1-n2-v1')).toBeNull()
    expect(holder.querySelector('#m3n-e-1-n3-v1')?.textContent).toBe('夏')
  })
  it('engraves a partial tuplet slur from the second child rather than the group start', () => {
    const engrave = (body: string) => {
      const projected = projectStaffDocument(analyzeM3N('{4/4}\nN: ' + body + ' 1^. |||').score)
      const measure = textMeasurer(), lines = planStaffLines(projected, 600, false, measure, 0.25)
      const holder = document.createElement('div')
      holder.innerHTML = engraveStaffSystems(projected, lines, 600, measure, 0.25, false).map(system => xml(system.node)).join('')
      const slur = holder.querySelector('g.slur path')!
      expect(slur).not.toBeNull()
      expect(holder.querySelectorAll('g.slur')).toHaveLength(1)
      expect(holder.querySelectorAll('g.tie')).toHaveLength(0)
      return slur.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    }
    const partial = engrave('([3 {lg}4 5{/}:2])')
    const whole = engrave('{lg}([3 4 5:2]){/}')
    expect(partial[0]).toBeGreaterThan(whole[0]!)
    expect(partial[6]).toBeCloseTo(whole[6]!)
  })

  it('caches candidate layouts without mutating input or changing pagination geometry', async () => {
    const source = readFileSync(resolve(import.meta.dirname, `../../../../src/scores/turkish_march_01.m3n`), 'utf8')
    const score = analyzeM3N(source).score
    const before = structuredClone(score)
    const prepared = await prepareStaffScore(score, { width: 550 })
    for (const width of [540, 550, 640, 720]) {
      const count = prepared.pageCount(true, width)
      expect(count).toBeGreaterThan(0)
      expect(prepared.layoutInfo(width).pages).toHaveLength(count)
      expect(prepared.pageCount(true, width)).toBe(count)
      const quality = 1 / (1 + prepared.layoutInfo(width).quality.totalCost)
      for (const pages of [1, 2, count]) for (const threshold of [0, .5, 1.01]) {
        if (!prepared.canBeatPageQuality(pages, threshold, width))
          expect(count > pages || count === pages && quality < threshold).toBe(true)
      }
    }
    expect((await prepareStaffScore(score, { width: 550 })).layoutInfo()).toEqual(prepared.layoutInfo(550))
    expect(score).toEqual(before)
  }, 120_000)
})

it('screens horizontal quality without changing a completed staff layout', async () => {
  const score = analyzeM3N(readFileSync(resolve(import.meta.dirname, '../../../../src/scores/mo_li_hua_01.m3n'), 'utf8')).score
  for (const width of [528, 624, 768]) {
    const render = await prepareStaffScore(score, { width })
    expect(render.canExceedQuality(0)).toBe(true)
    expect(render.canExceedQuality(1.01)).toBe(false)
    const actual = render.layoutInfo()
    expect(render.measurementInfo()).toEqual({ quality: actual.quality, rows: actual.lines.length, pageCount: actual.pageCount })
    expect(render.qualityUpperBound()).toBeGreaterThanOrEqual(1 / (1 + actual.quality.totalCost))
    expect(actual).toEqual((await prepareStaffScore(score, { width })).layoutInfo())
    expect(render.canExceedQuality(1 / (1 + actual.quality.totalCost))).toBe(true)
  }
})
it.each(['yan_hua_yi_leng_01', 'qing_niao_01'])('avoids an isolated final system in %s at fixed width', async name => {
  const score = analyzeM3N(readFileSync(resolve(import.meta.dirname, `../../../../src/scores/${name}.m3n`), 'utf8')).score
  const before = structuredClone(score)
  const prepared = await prepareStaffScore(score, { width: 640 })
  const info = prepared.layoutInfo()
  expect(info.pages.length).toBeGreaterThan(0)
  if (info.pages.length > 1) expect(info.pages.at(-1)!.systems.length).toBeGreaterThanOrEqual(2)
  expect(info.pageFit.pageRows.reduce((sum, count) => sum + count, 0)).toBe(info.lines.length)
  expect(info.lines.every(line => Number.isFinite(line.localReadingPenalty))).toBe(true)
  expect(score).toEqual(before)
}, 30_000)


it('reuses full-row rhythm measurements across break plans without sharing mutable line targets',()=>{
 const score=analyzeM3N('{4/4}\nN: 1 2 3 4 | (5 6) 7 1e 2e | 3e 4e 5e 6e |||').score
 const projected=projectStaffDocument(score),measure=textMeasurer()
 const minimum=createStaffMeasureMinimum(false,measure)
 minimum.rhythmic=vi.fn(minimum.rhythmic!)
 const graph=prepareStaffLineGraph(projected,600,false,measure,.6,minimum)
 const first=graph.makeLines([1,3])
 const calls=vi.mocked(minimum.rhythmic).mock.calls.length
 first[0]!.target=1;first[0]!.measures.pop()
 expect(graph.makeLines([1,3])).toEqual(prepareStaffLineGraph(projected,600,false,measure,.6).makeLines([1,3]))
 expect(vi.mocked(minimum.rhythmic).mock.calls).toHaveLength(calls)
 graph.makeLines([2,3])
 const more=vi.mocked(minimum.rhythmic).mock.calls.length
 expect(more).toBeGreaterThan(calls)
 graph.makeLines([2,3])
 expect(vi.mocked(minimum.rhythmic).mock.calls).toHaveLength(more)
 expect(graph.makeLines([1],false,0,false)[0]!.unitRhythmicGap).toBeUndefined()
})

it('publishes a complete staff candidate or rejects its entire width under exact total-cost bounds', async () => {
  const score = analyzeM3N('{4/4}\nN: {p}(1 2 3 4 | 5 6 7 1e) | 2e 3e 4e 5e |||').score
  const baseline = await prepareStaffScore(score, {width:564})
  const expected = baseline.measurementInfo()
  const quality = 1 / (1 + expected.quality.totalCost + scorePageCost(baseline.pageCount(true)))
  for (const widthBound of [{width:570,quality}, {width:528,quality:quality / 2}]) {
    const actual = await prepareStaffScore(score, {width:564})
    expect(withScoreWidthCandidatePolicy({widthBound}, () => actual.measurementInfo())).toEqual(expected)
    expect(actual(true).map(svg => svg.outerHTML)).toEqual(baseline(true).map(svg => svg.outerHTML))
  }
  const rejected = await prepareStaffScore(score, {width:564})
  try {
    withScoreWidthCandidatePolicy({widthBound:{width:528,quality:1}}, () => rejected.measurementInfo())
    throw new Error('Expected certified rejection')
  } catch (error) {
    expect(error).toHaveProperty('code', 'M3N_WIDTH_QUALITY_PRUNED')
  }
})
