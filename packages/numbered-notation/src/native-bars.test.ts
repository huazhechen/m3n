import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeBarSvg, nativeMeasureBarPositions } from './native-bars.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

const measurer = new DefaultTextMeasurer()
const layout = (first = '1') => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${first} 2 3 4 :||| {x3} |`), { width: 800, paged: false, textMeasurer: measurer })
const repeatInk = (score: ReturnType<typeof layout>) => nativeSvgInk(score.systems[0]!.decorationLayout!.find(item => item.svg.includes('repeat-count'))!.svg, measurer)

describe('measured bar obstacles', () => {
  it('puts a repeat-count label above the actual closing bar with the same text clearance', () => {
    const score = layout(), system = score.systems[0]!, label = repeatInk(score)
    const bar = nativeMeasureBarPositions(system.measures, system.measures.length - 1).at(-1)!
    const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
    expect(label.right).toBeGreaterThan(ink.left)
    expect(label.left).toBeLessThan(ink.right)
    expect(label.bottom).toBeCloseTo(ink.top - nativeStyle.small * 0.4, 4)
  })
  it('keeps the repeat label local when an unrelated high note raises the lane', () => {
    const plain = layout(), high = layout('1eeee')
    expect(repeatInk(high)).toEqual(repeatInk(plain))
    expect(high.systems[0]!.lanes[0]!.top).toBeGreaterThan(plain.systems[0]!.lanes[0]!.top)
  })
})


describe('measured bar alignment', () => {
  const unusual: TextMeasurer = { measureText(text, style) {
    return { w: text.length * style.fontSize * .6, h: style.fontSize * .4, baseline: style.fontSize * .1 }
  } }
  it.each(['single', 'dbl', 'end', 'rptstart', 'rptend', 'rptboth'])('centers %s on the actual music axis', kind => {
    const y = 53, zero = unusual.measureText('0', { fontSize: nativeStyle.music, fontFamily: 'M3N Numbers' })
    const ink = nativeSvgInk(nativeBarSvg(kind, 80, y, unusual), unusual)
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(y + zero.h / 2 - zero.baseline, 4)
  })
  it.each([false, true])('uses the painted bar envelope in lane layout (paged: %s)', paged => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ||: 1 2 3 4 :||'), { width: 320, paged, textMeasurer: unusual })
    const lane = score.systems[0]!.lanes[0]!
    const ink = nativeSvgInk(nativeBarSvg('rptend', 0, 0, unusual), unusual)
    expect(lane.top).toBeCloseTo(-ink.top, 4)
    expect(lane.bodyBottom).toBeCloseTo(ink.bottom, 4)
  })
})
