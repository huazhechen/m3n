import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeSvgInk } from './native-ink.js'
import { NativeSymbols } from './native-symbols.js'

const options = { width: 800, paged: false }
const layout = (music: string, extra = {}) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), { ...options, ...extra })
const annotations = (score: ReturnType<typeof layout>) => score.projection.glyphs.flatMap(glyph => glyph.annotationLayout ?? [])

describe('native annotations', () => {
  it('keeps centered heading ink inside both measured frame insets', () => {
    const measurer = { measureText() { return { w: 8.5, advance: 8.5, h: 11, baseline: 9, inkLeft: -3, inkRight: 13, centerOffset: .75 }; } }
    const score = layoutNativeScore(parseM3NDocument('{4/4}\n===A{br}\nN: 1 2 3 4 |||'), { ...options, textMeasurer: measurer })
    const item = annotations(score).find(item => item.kind === 'section')!
    const svg = nativeAnnotationSvg(item, 0, new NativeSymbols(measurer))
    const ink = nativeSvgInk(svg.match(/<text[\s\S]*?<\/text>/)![0], measurer)
    expect(ink.left - item.x + item.width / 2).toBeCloseTo(3.5, 4)
    expect(item.x + item.width / 2 - ink.right).toBeCloseTo(3.5, 4)
  })
  it('leaves note spacing, wrapping and arc geometry unchanged', () => {
    const bare = layout('{lg}1 2{/} 3 4')
    const labelled = layout('{text=Allegro}{lg}1 2{/} 3 4')
    expect(labelled.projection.glyphs.map(glyph => glyph.x)).toEqual(bare.projection.glyphs.map(glyph => glyph.x))
    expect(labelled.systems.map(system => system.measures.map(measure => measure.id))).toEqual(bare.systems.map(system => system.measures.map(measure => measure.id)))
    const arc = nativeArcGeometry(labelled.relations[0]!, labelled.systems[0]!)
    expect(arc).toEqual(nativeArcGeometry(bare.relations[0]!, bare.systems[0]!))
    const text = annotations(labelled)[0]!
    expect(text.top - text.height).toBeGreaterThanOrEqual(arc.top + 5.6 - 1e-8)
  })

  it('clears neighboring high notes covered by the text width', () => {
    const score = layout('1 {text=Very expressive passage}2 3eee 4', { width: 320 })
    const text = annotations(score)[0]!, high = score.projection.glyphs[2]!
    expect(high.x).toBeGreaterThanOrEqual(text.x - text.width / 2)
    expect(high.x).toBeLessThanOrEqual(text.x + text.width / 2)
    expect(text.top - text.height).toBeGreaterThanOrEqual(high.top + 5.6 - 1e-8)
  })

  it('does not move a local label for an unrelated high note outside its range', () => {
    const low = layout('{text=soft}1 2 3 4'), high = layout('{text=soft}1 2 3 4eee')
    expect(annotations(low)).toEqual(annotations(high))
  })

  it('stacks chord names, local descriptions and framed headings in semantic order', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\n===A{br}\nN: {chord=C}{text=Play softly}1 2 3 4 |||'), options)
    const [chord, text, section] = annotations(score)
    expect([chord!.kind, text!.kind, section!.kind]).toEqual(['chord', 'text', 'section'])
    expect(text!.top - text!.height).toBeGreaterThanOrEqual(chord!.top + 5.6 - 1e-8)
    expect(section!.top - section!.height).toBeGreaterThanOrEqual(text!.top + 5.6 - 1e-8)
    expect(section!.x - section!.width / 2).toBe(32)
    expect(score.systems[0]!.lanes[0]!.top).toBe(section!.top)
  })

  it('keeps local descriptions out of shared music height', () => {
    const score = layout('{text=soft}1 2 3 4 | {br}1 2 3 4', { uniformSystemHeight: true })
    const [first, second] = score.systems.map(system => system.lanes[0]!)
    expect(first!.top).toBeGreaterThan(second!.top)
    const chord = layout('{chord=C}1 2 3 4 | {br}1 2 3 4', { uniformSystemHeight: true })
    expect(chord.systems[0]!.lanes[0]!.top).toBe(chord.systems[1]!.lanes[0]!.top)
  })

  it('keeps descriptions above the measured grace block rather than a fixed allowance', () => {
    const score = layout('{text=cresc.}1{ac(2e 3e)} 2 3 4')
    const glyph = score.projection.glyphs[0]!, text = annotations(score)[0]!
    const grace = glyph.graceLayout!
    expect(glyph.musicTop).toBeCloseTo(-grace.ink.top, 4)
    expect(text.top - text.height).toBeGreaterThanOrEqual(-grace.ink.top + 5.6 - 1e-8)
  })

  it('does not let annotation height move a volta back over the annotation', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: {text=soft}1 2 3 4 :||\n---V2\nN: 1 2 3 4 |||'), options)
    const labelled = score.projection.glyphs.find(glyph => glyph.annotationLayout?.length)!
    const text = labelled.annotationLayout![0]!
    const system = score.systems.find(system => system.measures.some(measure => measure.columns.some(column => column.glyphs.includes(labelled))))!
    const volta = system.voltas!.find(volta => volta.left <= labelled.x && volta.right >= labelled.x)!
    expect(text.top - text.height).toBeGreaterThan(volta.top - 7)
    expect(new Set(system.voltas!.map(volta => volta.top)).size).toBe(1)
  })
})
