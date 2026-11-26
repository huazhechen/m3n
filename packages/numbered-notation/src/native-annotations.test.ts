import { SCORE_TEXT_FONT } from './font-family.js'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeRibbonRange } from './native-curve.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeSvgInk } from './native-ink.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeLanePieces } from './native-lanes.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'

const options = { width: 800, paged: false }
const layout = (music: string, extra = {}) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), { ...options, ...extra })
const annotations = (score: ReturnType<typeof layout>) => score.projection.glyphs.flatMap(glyph => glyph.annotationLayout ?? [])

describe('native annotations', () => {
  it('keeps instruction and expression distinct while combining only the expression with tempo', () => {
    const score = layout('1 {60qpm}{text=Switch breath}{expression=Largo}2 3 4')
    const items = annotations(score)
    expect(items.find(item => item.kind === 'text')!.text).toBe('Switch breath')
    expect(items.find(item => item.kind === 'expression')!.text).toContain('Largo (')
  })

  it.each(['', '{p}', '{f}'])('keeps standalone headings at the same core gap with a nonoverlapping first-note mark: %s', mark => {
    const measurer = new DefaultTextMeasurer()
    const score = layoutNativeScore(parseM3NDocument(`{4/4}\n===A{br}\nN: ||: ${mark}1 2 3 4eee :|||`), { ...options, textMeasurer: measurer })
    const system = score.systems[0]!, heading = annotations(score).find(item => item.kind === 'section')!
    const coreTop = Math.max(...nativeLanePieces(system, measurer, true).get('melody')!.map(piece => -piece.top))
    expect(heading.top - heading.height - coreTop).toBeCloseTo(5.76, 6)
  })

  it('keeps the core gap when a repeat bar slightly exceeds the measured octave-note height', () => {
    const fallback = new DefaultTextMeasurer()
    const measurer: TextMeasurer = { measureText(text, style) {
      const metrics = fallback.measureText(text, style)
      return style.fontFamily === 'Barlow Semi Condensed' ? { ...metrics, h: style.fontSize * .65, baseline: style.fontSize * .65, inkBottom: style.fontSize * .65 } : metrics
    } }
    const score = layoutNativeScore(parseM3NDocument('{4/4}\n===B{br}\nN: ||: {f}(1e){tip} (2e){tip} 3e 4e :|||'), { ...options, textMeasurer: measurer })
    const heading = annotations(score).find(item => item.kind === 'section')!
    const coreTop = Math.max(...nativeLanePieces(score.systems[0]!, measurer, true).get('melody')!.map(piece => -piece.top))
    expect(heading.top - heading.height - coreTop).toBeCloseTo(5.76, 6)
  })

  it.each(['chord', 'text'])('anchors the first character of a %s to its note', kind => {
    const measurer = new DefaultTextMeasurer()
    const score = layout(`1 {${kind}=G7}2 3 4`, { textMeasurer: measurer })
    const item = annotations(score)[0]!, host = score.projection.glyphs[1]!
    const first = measurer.measureText('G', { fontSize: 14, fontFamily: SCORE_TEXT_FONT })
    expect(item.textX + first.w / 2).toBeCloseTo(host.x, 6)
    expect(item.x).toBeGreaterThan(host.x)
  })
  const fallback = new DefaultTextMeasurer()
  const overhang: TextMeasurer = { measureText(text, style) {
    return text === 'WIDE' ? { w: 10, advance: 10, inkLeft: -80, inkRight: 90, centerOffset: 0, h: 14, baseline: 11 }
      : fallback.measureText(text, style)
  } }

  it.each(['{text=WIDE}1 2 3 4', '1 2 3 {text=WIDE}4'])('clamps complete unframed ink to the page for %s', music => {
    const score = layout(music, { width: 320, textMeasurer: overhang })
    const item = annotations(score)[0]!, ink = nativeSvgInk(nativeAnnotationSvg(item, 0, new NativeSymbols(overhang)), overhang)
    expect(ink.left).toBeGreaterThanOrEqual(32)
    expect(ink.right).toBeLessThanOrEqual(288)
  })

  it('clears a high neighbor reached only by unframed overhang', () => {
    const score = layout('{text=WIDE}1 2eee 3 4', { width: 320, textMeasurer: overhang })
    const item = annotations(score)[0]!, high = score.projection.glyphs[1]!
    const ink = nativeSvgInk(nativeAnnotationSvg(item, 0, new NativeSymbols(overhang)), overhang)
    expect(high.x).toBeGreaterThan(32 + 10)
    expect(high.x).toBeLessThan(ink.right)
    expect(ink.bottom).toBeLessThanOrEqual(-high.top - 5.76 + 1e-8)
  })

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
    expect(text.top - text.height).toBeGreaterThanOrEqual(-nativeRibbonRange(arc, text.x - text.width / 2, text.x + text.width / 2)!.top + 5.76 - 1e-8)
  })

  it('clears neighboring high notes covered by the text width', () => {
    const score = layout('1 {text=Very expressive passage}2 3eee 4', { width: 320 })
    const text = annotations(score)[0]!, high = score.projection.glyphs[2]!
    expect(high.x).toBeGreaterThanOrEqual(text.x - text.width / 2)
    expect(high.x).toBeLessThanOrEqual(text.x + text.width / 2)
    expect(text.top - text.height).toBeGreaterThanOrEqual(high.top + 5.76 - 1e-8)
  })

  it('does not move a local label for an unrelated high note outside its range', () => {
    const low = layout('{text=soft}1 2 3 4'), high = layout('{text=soft}1 2 3 4eee')
    expect(annotations(low)).toEqual(annotations(high))
  })

  it('stacks chord names, local descriptions and framed headings in semantic order', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\n===A{br}\nN: {chord=C}{text=Play softly}1 2 3 4 |||'), options)
    const [chord, text, section] = annotations(score)
    expect([chord!.kind, text!.kind, section!.kind]).toEqual(['chord', 'text', 'section'])
    expect(text!.top - text!.height).toBeGreaterThanOrEqual(chord!.top + 5.76 - 1e-8)
    expect(section!.top - section!.height).toBeGreaterThanOrEqual(text!.top + 5.76 - 1e-8)
    expect(section!.x - section!.width / 2).toBe(32)
    expect(score.systems[0]!.lanes[0]!.top).toBe(section!.top)
  })

  it.each([false, true])('clears only the grace ink reached by the actual description footprint: overhang=%s', wide => {
    const score = layout(`{text=${wide ? 'WIDE' : 'cresc.'}}1{ac(2e 3e)} 2 3 4`, wide ? { textMeasurer: overhang } : {})
    const glyph = score.projection.glyphs[0]!, text = annotations(score)[0]!
    const pieces = glyph.musicInk!.filter(ink => glyph.x + ink.right > text.x - text.width / 2 && glyph.x + ink.left < text.x + text.width / 2)
    const top = Math.max(...pieces.map(ink => -ink.top))
    expect(text.top - text.height).toBeCloseTo(top + 5.76, 5)
    if (wide) expect(top).toBeCloseTo(-glyph.graceLayout!.ink.top, 4)
    else expect(top).toBeLessThan(-glyph.graceLayout!.ink.top)
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
