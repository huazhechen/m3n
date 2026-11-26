import { readFileSync } from 'node:fs'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
// jsdom has no SVG character-position API; compare engraving before browser
// text resolution here. Full PDF parity covers real browser text placement.
vi.mock('./svg-text.js', () => ({ resolveStaffText: vi.fn() }))
import { scorePhysicalSpacing } from '@m3n/numbered-notation'
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument } from './staff-document.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { textMeasurer, xml } from './layout-svg.js'

describe('staff page packing', () => {
  it('reuses engraving across gap fits with the same geometry and SVG as fresh layouts', async () => {
    const score = analyzeM3N(readFileSync('../../src/scores/mo_li_hua_01.m3n', 'utf8')).score
    const shared = await prepareStaffScore(score, { width: 550, coreGap: 20 })
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

  it('compares both minimum tiers using the same physical spacing objective', async () => {
    const score = analyzeM3N(readFileSync('../../src/scores/mo_li_hua_01.m3n', 'utf8')).score
    const info = (await prepareStaffScore(score, { width: 768 })).layoutInfo()
    expect(info.pageCount).toBe(1)
    for (const spacing of [.6, 1.2]) {
      const lines = planStaffLines(projectStaffDocument(score), 766, false, textMeasurer(), spacing)
      const quality = scorePhysicalSpacing(lines.flatMap(line => line.unitRhythmicGap === undefined ? [] : [line.unitRhythmicGap]), 8.4)
      expect(info.quality.spacingCost).toBeLessThanOrEqual(quality.spacingCost + 1e-9)
    }
  })

  it('uses the loose tier when every candidate has the same physical spacing quality', async () => {
    const render = await prepareStaffScore(analyzeM3N('{4/4}\nN: 1 2 3 4 |||').score, { width: 640 })
    const info = render.layoutInfo()
    expect(info.pageCount).toBe(1)
    expect(info.lines).toHaveLength(1)
    expect(info.quality.lineDensityVariation).toBe(0)
    expect(info.quality.lastLineSlack).toBe(0)
    expect(info.spacing).toBe(1.2)
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
    const source = readFileSync(`../../src/scores/turkish_march_01.m3n`, 'utf8')
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
  const score = analyzeM3N(readFileSync('../../src/scores/mo_li_hua_01.m3n', 'utf8')).score
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
  const score = analyzeM3N(readFileSync(`../../src/scores/${name}.m3n`, 'utf8')).score
  const before = structuredClone(score)
  const prepared = await prepareStaffScore(score, { width: 640 })
  const info = prepared.layoutInfo()
  expect(info.pages.length).toBeGreaterThan(0)
  if (info.pages.length > 1) expect(info.pages.at(-1)!.systems.length).toBeGreaterThanOrEqual(2)
  expect(info.pageFit.pageRows.reduce((sum, count) => sum + count, 0)).toBe(info.lines.length)
  expect(info.lines.every(line => Number.isFinite(line.localReadingPenalty))).toBe(true)
  expect(score).toEqual(before)
}, 30_000)
