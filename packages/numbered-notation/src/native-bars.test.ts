import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeBarSvg, nativeMeasureBarPositions, nativeLaneBarPositions } from './native-bars.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeStyle } from './native-style.js'

const measurer = new DefaultTextMeasurer()
const layout = (first = '1') => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${first} 2 3 4 :||| {x3} |`), { width: 800, paged: false, textMeasurer: measurer })
const repeatInk = (score: ReturnType<typeof layout>) => nativeSvgInk(score.systems[0]!.decorationLayout!.find(item => item.svg.includes('repeat-count'))!.svg, measurer)

describe('measured bar obstacles', () => {
  it('puts a repeat-count label above the actual closing bar with the same text clearance', () => {
    const score = layout(), system = score.systems[0]!, label = repeatInk(score)
    const bar = nativeMeasureBarPositions(system.measures, system.measures.length - 1).at(-1)!
    const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
    expect((label.left + label.right) / 2).toBeCloseTo(bar.x, 4)
    expect(label.right).toBeGreaterThan(ink.left)
    expect(label.left).toBeLessThan(ink.right)
    expect(label.bottom).toBeCloseTo(ink.top - nativeStyle.music * 0.12, 4)
  })
  it('places each measure number at its closing boundary, including a shared repeat opening', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :||'), { width: 800, paged: false, textMeasurer: measurer, measureNumbers: true })
    const system = score.systems[0]!
    const opening = nativeMeasureBarPositions(system.measures, 1).find(bar => bar.kind === 'rptstart')!
    const first = system.decorationLayout!.find(label => label.svg.includes('>1</text>'))!
    const ink = nativeSvgInk(first.svg, measurer)
    expect((ink.left + ink.right) / 2).toBeCloseTo(opening.x, 4)
    expect(system.decorationLayout!.filter(label => label.svg.includes('data-m3n-role="annotation"'))).toHaveLength(2)
  })
  it('clears measured bar-label ink with the arc ribbon instead of drawing through the number', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | 5 6 7 1e{/} |||'), { width: 800, paged: false, textMeasurer: measurer, measureNumbers: true })
    const system = score.systems[0]!, relation = system.relations.find(relation => relation.kind === 'slur')!
    const label = system.decorationLayout!.find(label => label.svg.includes('>1</text>'))!
    const ink = nativeSvgInk(label.svg, measurer), arc = nativeArcGeometry(relation, system)
    const placed = system.relationLayout!.get(relation)!
    const dy = placed.ink.top + arc.top
    const slice = nativeArcSlice(arc.commands, (ink.left + ink.right) / 2)!
    expect(slice.bottom + dy).toBeLessThanOrEqual(ink.top + .001)
  })
  it('keeps the repeat label local when an unrelated high note raises the lane', () => {
    const plain = layout(), high = layout('1eeee')
    expect(repeatInk(high)).toEqual(repeatInk(plain))
    expect(high.systems[0]!.lanes[0]!.top).toBeGreaterThan(plain.systems[0]!.lanes[0]!.top)
  })
  it('does not lift a tuplet for a measure number outside its horizontal span', () => {
    const document = parseM3NDocument('{4/4}\nN: ([1 2 3:2]) 4 5 6 | 1 2 3 4 |||')
    const options = { width: 800, paged: false, textMeasurer: measurer }
    const plain = layoutNativeScore(document, options).systems[0]!
    const numbered = layoutNativeScore(document, { ...options, measureNumbers: true }).systems[0]!
    const tupletInk = (system: typeof plain) => system.relationLayout!.get(system.relations.find(relation => relation.kind === 'tuplet')!)!.ink
    expect(tupletInk(numbered)).toEqual(tupletInk(plain))
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
  it.each([320, 800].flatMap(width => [false, true].map(paged => ({ width, paged }))))('reserves only visible bars in a split measure at $width (paged: $paged)', ({ width, paged }) => {
    const document = parseM3NDocument(`{64/4}\nN: ${Array(64).fill('1').join(' ')} |||`)
    const score = layoutNativeScore(document, { width, paged, textMeasurer: unusual, uniformSystemHeight: false })
    const fragments = score.systems.filter(system => system.measures.every((_, index) => !nativeLaneBarPositions(system.measures, index, 'melody').length))
    expect(fragments.length).toBeGreaterThan(0)
    for (const system of fragments) {
      const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === 'melody')
      const lane = system.lanes.find(lane => lane.id === 'melody')!
      expect(lane.top).toBeCloseTo(Math.max(...glyphs.map(glyph => glyph.top)), 4)
      expect(lane.bodyBottom).toBeCloseTo(Math.max(...glyphs.map(glyph => glyph.bottom)), 4)
    }
    const last = score.systems.at(-1)!, lastLane = last.lanes.find(lane => lane.id === 'melody')!
    const bar = nativeLaneBarPositions(last.measures, last.measures.length - 1, 'melody').at(-1)!
    const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, unusual), unusual)
    expect(lastLane.top).toBeCloseTo(-ink.top, 4)
    expect(lastLane.bodyBottom).toBeCloseTo(ink.bottom, 4)
  })
})
