// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLanePieces } from './native-lanes.js'
import { nativeStyle } from './native-style.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'
import { renderNativePages } from './native-svg.js'

const source = '{4/4}\nN: ||: 1d 2d 3 4 | 1 2 3 4 :||\nL1: 春天在哪里呀甲乙\nL2: 第二遍啊丙丁戊己\nNs[2]: 2: {lg}{text=说明}1e{tr} 2~ 2 4{/} |'
const unusual: TextMeasurer = { measureText(text, style) {
  const w = [...text].length * style.fontSize * .65, baseline = style.fontSize * (text.includes('说') ? 1.2 : .9)
  return { w, h: baseline + style.fontSize * .3, baseline }
} }

describe('native local lane clearance', () => {
  it.each([new DefaultTextMeasurer(), unusual])('uses only the measured clearance needed by overlapping primitives', textMeasurer => {
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false, textMeasurer })
    const system = layout.systems[0]!, pieces = nativeLanePieces(system, textMeasurer)
    const [main, alternative] = system.lanes
    const clearances: number[] = []
    for (const upper of pieces.get(main!.id)!) for (const lower of pieces.get(alternative!.id)!) {
      if (upper.right < lower.left || upper.left > lower.right) continue
      clearances.push(lower.top + alternative!.y - upper.bottom - main!.y)
    }
    expect(clearances.length).toBeGreaterThan(0)
    expect(Math.min(...clearances)).toBeCloseTo(nativeStyle.music * .32, 6)
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    const ink = nativeSvgInk(root.querySelector('g.system')!.outerHTML, textMeasurer)
    expect(ink.top).toBeGreaterThanOrEqual(system.top - .001)
    expect(ink.bottom).toBeLessThanOrEqual(system.bottom + .001)
  })

  it('does not reserve a barline height on an alternative lane without barlines', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: ||: 1 2 :||\nNs[2]: 1: 3 4 |'), { width: 800, paged: false })
    const system = layout.systems[0]!, lane = system.lanes.find(lane => lane.id === 'alternative:2')!
    const pieces = nativeLanePieces(system, layout.measurer).get(lane.id)!
    expect(lane.top).toBeCloseTo(-Math.min(...pieces.map(ink => ink.top)), 6)
  })

  it('keeps full voices and explicit uniform-height lanes separated by their envelope gap', () => {
    for (const input of [source, source + '\nB: 1d 2d 3d 4d | 1d 2d 3d 4d |']) {
      const layout = layoutNativeScore(parseM3NDocument(input), { width: 800, paged: false, uniformSystemHeight: true })
      const lanes = layout.systems[0]!.lanes
      for (let i = 1; i < lanes.length; i++) expect(lanes[i]!.y - lanes[i]!.top - lanes[i - 1]!.y - lanes[i - 1]!.bottom).toBeCloseTo(nativeStyle.laneGap, 6)
    }
  })
})
