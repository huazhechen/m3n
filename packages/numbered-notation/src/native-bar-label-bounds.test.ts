import { describe, expect, it, vi } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { copyNativeDecoration, isNativeMeasureNumber, placeNativeBarLabels } from './native-system-labels.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeBarInk, nativeMeasureBarPositions } from './native-bars.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { NativeSymbols } from './native-symbols.js'

const measurer = new DefaultTextMeasurer()

it('defers hidden numeric labels through row snapshots and preserves their SVG', () => {
  const width=528, layout=layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |'),{width,paged:false,numericLayout:true,textMeasurer:measurer})
  const system=layout.systems[0]!
  system.measures.at(-1)!.number=1234
  system.decorationLayout=[]
  let labelsMeasured=0
  const probe={measureText(text: string,style: Parameters<DefaultTextMeasurer['measureText']>[1]) {
    if(text==='1234')labelsMeasured++
    return measurer.measureText(text,style)
  }}
  const painted = vi.spyOn(NativeSymbols.prototype, 'text')
  placeNativeBarLabels(system,[],probe,false,width)
  const hidden=system.decorationLayout!.find(isNativeMeasureNumber)!
  const snapshot=copyNativeDecoration(hidden)
  expect(labelsMeasured).toBe(1)
  expect(painted).not.toHaveBeenCalled()
  expect(snapshot.ink).toEqual(hidden.ink)
  painted.mockRestore()
  system.decorationLayout=[]
  placeNativeBarLabels(system,[],measurer,true,width)
  expect(snapshot.svg).toBe(system.decorationLayout!.find(isNativeMeasureNumber)!.svg)
  expect(labelsMeasured).toBe(1)
})

describe('bar labels with small page margins', () => {
  it.each([false, true].flatMap(paged => [0, 24 * .2].map(pageMargin => ({ paged, pageMargin }))))('keeps multi-digit measure numbers and repeat counts in the canvas: $paged/$pageMargin', ({ paged, pageMargin }) => {
    const width = 320
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |'), { width, paged, pageMargin, textMeasurer: measurer })
    const system = score.systems[0]!
    system.measures[0]!.number = 1234
    system.measures[0]!.source.repeatCount = 123
    system.decorationLayout = []
    placeNativeBarLabels(system, [], measurer, true, width)
    const number = system.decorationLayout!.find(label => label.svg.includes('measure-number'))!
    const closing = nativeMeasureBarPositions(system.measures, 0).at(-1)!
    expect(nativeSvgInk(number.svg, measurer).right).toBeCloseTo(nativeBarInk(closing.kind, closing.x, 0, measurer).right, 4)
    const labels = system.decorationLayout!
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      const ink = nativeSvgInk(label.svg, measurer)
      expect(ink.left).toBeGreaterThanOrEqual(-.0001)
      expect(ink.right).toBeLessThanOrEqual(width + .0001)
    }
  })
})

it.each(['|', '||', '|||', ':||'])('aligns the white-backed number to the painted right edge of %s', closing => {
  const score = layoutNativeScore(parseM3NDocument(`{4/4}\nN: 1 2 3 4 ${closing}`), { width: 320, paged: false, measureNumbers: true, textMeasurer: measurer })
  const system = score.systems[0]!
  const number = system.decorationLayout!.find(label => label.svg.includes('measure-number'))!
  const bar = nativeMeasureBarPositions(system.measures, 0).at(-1)!
  const barInk = nativeBarInk(bar.kind, bar.x, 0, measurer)
  const [background, text] = nativeSvgPieces(number.svg, measurer)
  expect(background!.left).toBeCloseTo(text!.left - 2, 4)
  expect(background!.top).toBeCloseTo(text!.top - 2, 4)
  expect(background!.bottom).toBeCloseTo(text!.bottom + 2, 4)
  expect(background!.right).toBeCloseTo(text!.right, 4)
  expect(text!.right).toBeCloseTo(barInk.right, 4)
  expect(text!.bottom).toBeCloseTo(barInk.top - 2, 4)
})

it.each([false, true].flatMap(paged =>
  [false, true].flatMap(numericLayout =>
    ['', '{lg}1 2 3 4{/} |{br}'].map(decoration => ({ paged, numericLayout, decoration })))))('reserves the same actual number bounds with labels shown or hidden ($paged/$numericLayout/$decoration)', ({ paged, numericLayout, decoration }) => {
  const document = parseM3NDocument('{4/4}\nN: ' + decoration + '1 2 3 4 |{br} '.repeat(24))
  const options = { width: 320, pageMargin: 0, paged, numericLayout, textMeasurer: measurer }
  const hidden = layoutNativeScore(document, options)
  const visible = layoutNativeScore(document, { ...options, measureNumbers: true })
  const geometry = (layout: typeof hidden) => ({
    pages: layout.pages.map(page => [page.height, page.coreGap]),
    blocks: layout.verticalBlocks,
    systems: layout.systems.map(system => [system.page, system.top, system.bottom, ...system.lanes.map(lane => lane.y)]),
    notes: layout.projection.glyphs.map(glyph => [glyph.x, glyph.y]),
  })
  expect(geometry(hidden)).toEqual(geometry(visible))
  expect(hidden.systems.flatMap(system => system.decorationLayout ?? []).some(label => label.hidden)).toBe(true)
})
