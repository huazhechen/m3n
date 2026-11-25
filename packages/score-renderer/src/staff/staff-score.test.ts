import { readFileSync } from 'node:fs'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
import { scoreHorizontalQuality, scoreLineQuality } from '@m3n/numbered-notation'
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { projectStaffDocument } from './staff-document.js'
import { planStaffLines, STAFF_SCALE } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { textMeasurer, xml } from './layout-svg.js'

describe('staff page packing', () => {
  it('prefers more even line density over the widest spacing at equal page count', async () => {
    const score = analyzeM3N(readFileSync('../../src/scores/mo_li_hua_01.m3n', 'utf8')).score
    const info = (await prepareStaffScore(score, { width: 640 })).layoutInfo()
    const widest = planStaffLines(projectStaffDocument(score), 638, false, textMeasurer(), 0.375)
    const available = info.availableWidth
    const quality = scoreLineQuality(widest.map(line => line.minimum * STAFF_SCALE / available),
      Math.max(0, 1 - widest.at(-1)!.target * STAFF_SCALE / available))
    expect(info.pageCount).toBe(1)
    expect(info.spacing).toBeLessThan(0.375)
    expect(scoreHorizontalQuality(640, info.quality)).toBeGreaterThan(scoreHorizontalQuality(640, quality))
  })

  it('uses compact spacing when every candidate has the same horizontal quality', async () => {
    const render = await prepareStaffScore(analyzeM3N('{4/4}\nN: 1 2 3 4 |||').score, { width: 640 })
    const info = render.layoutInfo()
    expect(info.pageCount).toBe(1)
    expect(info.lines).toHaveLength(1)
    expect(info.quality.lineDensityVariation).toBe(0)
    expect(info.quality.lastLineSlack).toBe(0)
    expect(info.spacing).toBe(0.25)
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
    }
    expect((await prepareStaffScore(score, { width: 550 })).layoutInfo()).toEqual(prepared.layoutInfo(550))
    expect(score).toEqual(before)
  }, 120_000)
})
