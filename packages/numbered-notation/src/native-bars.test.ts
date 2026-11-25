import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nativeBarMetrics } from './native-horizontal.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeBarSvg, nativeBarPieces, nativeBarInk, nativeMeasureBarPositions, nativeLaneBarPositions } from './native-bars.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

const measurer = new DefaultTextMeasurer()
const layout = (first = '1') => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${first} 2 3 4 :||| {x3} |`), { width: 800, paged: false, textMeasurer: measurer })
const repeatInk = (score: ReturnType<typeof layout>) => nativeSvgInk(score.systems[0]!.decorationLayout!.find(item => item.svg.includes('repeat-count'))!.svg, measurer)

describe('measured bar obstacles', () => {
  it.each([false, true])('keeps bars within bounds when instrumental passages wrap (paged: %s)', paged => {
    const source = `{4/4}\nN: {inst}${Array(7).fill('1 2 3 4 |').join(' ')}{/} |||`
    const score = layoutNativeScore(parseM3NDocument(source), { width: 360, pageMargin: 0, paged, minimumNoteGap: 15, textMeasurer: measurer })
    expect(score.systems.length).toBeGreaterThan(1)
    for (const system of score.systems) for (let index = 0; index < system.measures.length; index++) {
      for (const bar of nativeMeasureBarPositions(system.measures, index)) {
        const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
        expect(ink.left).toBeGreaterThanOrEqual(-.000001)
        expect(ink.right).toBeLessThanOrEqual(360.000001)
      }
    }
  })
  it('puts a repeat-count label above the actual closing bar with the same text clearance', () => {
    const score = layout(), system = score.systems[0]!, label = repeatInk(score)
    const bar = nativeMeasureBarPositions(system.measures, system.measures.length - 1).at(-1)!
    const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
    expect((label.left + label.right) / 2).toBeCloseTo(bar.x, 4)
    expect(label.right).toBeGreaterThan(ink.left)
    expect(label.left).toBeLessThan(ink.right)
    expect(label.bottom).toBeCloseTo(ink.top - nativeStyle.music * 0.12, 4)
  })
  it('places only the row-end measure number at its closing boundary', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :||'), { width: 800, paged: false, textMeasurer: measurer, measureNumbers: true })
    const system = score.systems[0]!
    const closing = nativeMeasureBarPositions(system.measures, 1).at(-1)!
    const first = system.decorationLayout!.find(label => label.svg.includes('>2</text>'))!
    const ink = nativeSvgInk(first.svg, measurer)
    expect(ink.right).toBeCloseTo(nativeBarInk(closing.kind, closing.x, 0, measurer).right, 4)
    expect(system.decorationLayout!.filter(label => label.svg.includes('data-m3n-role="measure-number"'))).toHaveLength(1)
  })
  it('does not move slurs to avoid overlay numbers', () => {
    const document = parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | {br}5 6 7 1e{/} |||')
    const options = { width: 800, paged: false, textMeasurer: measurer }
    const plain = layoutNativeScore(document, options)
    const numbered = layoutNativeScore(document, { ...options, measureNumbers: true })
    for (const [index, system] of plain.systems.entries())
      expect([...numbered.systems[index]!.relationLayout!.values()]).toEqual([...system.relationLayout!.values()])
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
    const score = layoutNativeScore(document, { width, paged, textMeasurer: unusual })
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

it('direct bar pieces match painted coordinates, including fractional anchors and repeat dots', () => {
  for (const kind of ['single','dbl','end','rptstart','rptend','rptboth'])
    for (const x of [0,-12.123456789,479.189365789]) for (const y of [0,37.987654321]) {
      const svg = nativeBarSvg(kind,x,y,measurer)
      expect(nativeBarPieces(kind,x,y,measurer)).toEqual(nativeSvgPieces(svg,measurer))
      expect(nativeBarInk(kind,x,y,measurer)).toEqual(nativeSvgInk(svg,measurer))
    }
})

// A closing repeat followed by an opening repeat shares its central thick bar.
it('draws a combined repeat with thin bars on both sides of the thick bar', () => {
  const geometry = nativeBarMetrics('rptboth')
  expect(geometry.bars).toHaveLength(3)
  const [left, middle, right] = geometry.bars
  expect(left!.width).toBe(right!.width)
  expect(middle!.width).toBeGreaterThan(left!.width)
  expect(geometry.dots).toHaveLength(2)
  expect(geometry.dots[0]! + geometry.radius).toBeLessThan(left!.x)
  expect(geometry.dots[1]! - geometry.radius).toBeGreaterThan(right!.x + right!.width)
  const center = middle!.x + middle!.width / 2
  expect(center - geometry.dots[0]!).toBeCloseTo(geometry.dots[1]! - center, 8)
  const bars = [...nativeBarSvg('rptboth', 0, 0, measurer).matchAll(/<rect[^>]* width="([^"]+)"/g)]
  expect(bars).toHaveLength(3)
  bars.forEach((bar, index) => expect(Number(bar[1])).toBeCloseTo(geometry.bars[index]!.width, 4))
})

it.each([480, 720])('merges the two adjacent Turkish March repeats at %ipx', width => {
  const source = readFileSync(new URL('../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8')
  const score = layoutNativeScore(parseM3NDocument(source), { width, paged: false, textMeasurer: measurer, minimumNoteGap: 9 })
  const merged = score.systems.flatMap(system => system.measures.flatMap((measure, index) =>
    nativeMeasureBarPositions(system.measures, index).filter(bar => bar.kind === 'rptboth').map(() => measure.index + 1)))
  expect(merged).toEqual(width === 480 ? [9] : [9, 44])
})

it('splits adjacent repeats into closing and opening marks across a forced line break', () => {
  const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ||: 1 2 3 4 :|| {br} ||: 5 6 7 1e :||'), { width: 720, paged: false, textMeasurer: measurer })
  expect(score.systems).toHaveLength(2)
  const positions = score.systems.map(system => nativeMeasureBarPositions(system.measures, 0).map(bar => bar.kind))
  expect(positions).toEqual([['rptstart', 'rptend'], ['rptstart', 'rptend']])
})
