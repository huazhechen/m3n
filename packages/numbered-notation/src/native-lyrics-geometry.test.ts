// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLyricInk, nativeLyricSvg, nativeLyricPieces } from './native-lyrics.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { NativeSymbols, line } from './native-symbols.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { nativeSystemCore } from './native-core.js'

const options = { width: 800, paged: false }
const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||\nL: 春天在哪里 | 就在这里呀')
describe('native lyric and music lower envelopes', () => {
  it.each([
    { texts: ['春'], passes: undefined },
    { texts: ['“gyp！”'], passes: undefined, underlined: true, annotation: '1.2.' },
    { texts: [''], passes: undefined, annotation: '3.' },
    { texts: ['\u200B'], passes: undefined },
  ])('computes the exact painted lyric primitives without generating semantic SVG', data => {
    const layout = layoutNativeScore(document, options), measurer = new DefaultTextMeasurer()
    const glyph = layout.projection.glyphs[0]!
    glyph.x = 12.34567891; glyph.lyrics.set(0, data)
    const baseline = -3.12345678
    expect(nativeLyricPieces(data, glyph.x, baseline, measurer))
      .toEqual(nativeSvgPieces(nativeLyricSvg(glyph, 0, baseline, 2, measurer), measurer))
  })

  it('places lyrics after the musical body without adding barline height', () => {
    const score = layoutNativeScore(document, options), first = score.systems[0]!.lanes[0]!
    const measurer = new DefaultTextMeasurer()
    const numeral = measurer.measureText('0', { fontSize: 24 })
    const lyricMetrics = measurer.measureText('春', { fontSize: 16 })
    const bodyBottom = numeral.inkBottom! - numeral.baseline
    expect(first.bodyBottom).toBeCloseTo(7.8)
    expect(first.lyricBottom).toBeCloseTo(bodyBottom)
    expect(first.bottom).toBeCloseTo(bodyBottom + 5.76 + lyricMetrics.inkBottom!)
    const svg = NativeNumberedNotationScore.create(document).render(options).join('')
    const root = new DOMParser().parseFromString(svg, 'text/html')
    const lyric = root.querySelector('[data-m3n-role="lyric"]')!
    expect(Number(lyric.getAttribute('y')) - first.y).toBeCloseTo(bodyBottom + 5.76 + lyricMetrics.baseline, 4)
    const firstCore = nativeSystemCore(score.systems[0]!, score.measurer)!
    const secondCore = nativeSystemCore(score.systems[1]!, score.measurer)!
    expect(firstCore.bottom).toBeCloseTo(first.y + first.bottom)
    // The lyric gap starts at 0.8em; the high note's full ink can still
    // require slightly more space than its weighted core boundary.
    expect(secondCore.top - firstCore.bottom).toBeGreaterThanOrEqual(19.2 - 1e-6)
    expect(secondCore.top - firstCore.bottom).toBeLessThan(28.8)
  })

  it('uses beam and low-octave geometry when that body extends farther', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: (1d 2) 3 4 5 |||\nL: 春天在哪里'), options)
    const lane = score.systems[0]!.lanes[0]!
    expect(lane.lyricBottom).toBeCloseTo(9.72)
    expect(lane.bodyBottom).toBeCloseTo(9.72)
  })

  it('puts a lyric underline below the actual descenders, with measured clearance', () => {
    const measurer = { measureText(text: string, style: { fontSize: number }) {
      return { w: text.length * style.fontSize * 0.6, h: style.fontSize * 1.2, baseline: style.fontSize * 0.7 }
    } }
    const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: 1 2 |||\nL: (gyp) (yo)'), { ...options, textMeasurer: measurer })
    const glyph = score.projection.glyphs[0]!, size = 16
    const root = new DOMParser().parseFromString(nativeLyricSvg(glyph, 0, 0, 0, measurer), 'text/html')
    const underline = root.querySelector('line')!
    expect(underline).not.toBeNull()
    const top = Number(underline.getAttribute('y1')) - Number(underline.getAttribute('stroke-width')) / 2
    expect(top - size * 0.5).toBeCloseTo(size * 0.1, 4)
  })

  it('uses the lyric font for visit prefixes and reserves the complete painted fragment', () => {
    const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: ||: 1 2 :|||{x3}\nL1: 春天\nL2: 花开\nL3: {L2}'), options)
    const glyph = score.projection.glyphs[0]!, measurer = new DefaultTextMeasurer()
    const root = new DOMParser().parseFromString(nativeLyricSvg(glyph, 1, 0, 0, measurer), 'text/html')
    const prefix = root.querySelector('[data-m3n-role="lyric-prefix"]')!
    const lyric = root.querySelector('[data-m3n-role="lyric"]')!
    expect(prefix.textContent).toBe('2.3.')
    expect(prefix.getAttribute('font-size')).toBe(lyric.getAttribute('font-size'))
    const ink = nativeSvgInk(root.body.innerHTML, measurer)
    expect(glyph.lyricLeft).toBeGreaterThanOrEqual(glyph.x - ink.left + 1 - 0.001)
    expect(glyph.lyricRight).toBeGreaterThanOrEqual(ink.right - glyph.x + 1 - 0.001)
  })

  it('reserves punctuation ink without a full-width invisible character cell', () => {
    const measurer = { measureText(text: string) {
      const punctuation = text === '，'
      return { w: text.length * 16, advance: text.length * 16, inkLeft: punctuation ? 1 : 0,
        inkRight: punctuation ? 4 : text.length * 16, h: 16, baseline: 12 }
    } }
    const data = { texts: ['，'], passes: undefined }
    const ink = nativeLyricInk(data, measurer)
    expect(ink.right - ink.left).toBe(3)
    expect(ink).toEqual(nativeLyricPieces(data, 0, 0, measurer)[0])
  })

  it('aligns spoken text independently of surrounding punctuation and measures its asymmetry', () => {
    const measurer = new DefaultTextMeasurer()
    const plain = nativeLyricInk({ texts: ['春'], passes: undefined }, measurer)
    const quoted = nativeLyricInk({ texts: ['“春！”'], passes: undefined }, measurer)
    expect(quoted.left).toBeLessThan(plain.left)
    expect(quoted.right).toBeGreaterThan(plain.right)
    const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: 1 2 |||\nL: 春 天'), { ...options, textMeasurer: measurer })
    const glyph = score.projection.glyphs[0]!
    glyph.lyrics.set(0, { texts: ['“春！”'], passes: undefined })
    const root = new DOMParser().parseFromString(nativeLyricSvg(glyph, 0, 0, 0, measurer), 'text/html')
    const lyric = root.querySelector('[data-m3n-role="lyric"]')!
    const opening = measurer.measureText('“', { fontSize: 16 }).w
    const body = measurer.measureText('春', { fontSize: 16 }).w
    expect(Number(lyric.getAttribute('x')) + opening + body / 2).toBeCloseTo(glyph.x, 3)
    const painted = nativeSvgInk(root.body.innerHTML, measurer)
    expect(painted.left - glyph.x).toBeCloseTo(quoted.left, 3)
    expect(painted.right - glyph.x).toBeCloseTo(quoted.right, 3)
  })

  it('reserves true text overhang and ignores empty alignment slots', () => {
    const measurer = { measureText(text: string, style: { fontSize: number }) {
      return { w: text.length * style.fontSize, advance: text.length * style.fontSize, inkLeft: -3, inkRight: text.length * style.fontSize + 4, h: 12, baseline: 10 }
    } }
    const ink = nativeLyricInk({ texts: ['gyp'], passes: undefined }, measurer)
    expect(ink.right - ink.left).toBeCloseTo(3 * 16 + 7, 3)
    expect(nativeLyricInk({ texts: [''], passes: undefined }, measurer)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
    expect(nativeLyricInk({ texts: ['\u200B'], passes: undefined }, measurer)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
  })

  it('unions the actually painted number and beams, respecting the explicit offline ink bottom', () => {
    const pitch = { degree: '1', accidental: '', octave: 0 }, measurer = new DefaultTextMeasurer()
    const painter = new NativeSymbols(measurer)
    for (const beats of [1, 0.5, 0.25]) {
      const metrics = nativeNoteMetrics([pitch], beats, false, measurer)
      let svg = painter.pitch(pitch, 0, 0, 24, metrics.beamCount)
      for (let beam = 0; beam < metrics.beamCount; beam++) svg += line(-6, 3.54 + beam * 3.36, 7, 3.54 + beam * 3.36, 1.32)
      expect(metrics.bottom).toBeCloseTo(nativeSvgInk(svg, measurer).bottom, 8)
    }
    // A short real digit must not inherit the fallback font's nominal descent.
    const shortInk = { measureText: () => ({ w: 11, h: 15, baseline: 15 }) }
    expect(nativeNoteMetrics([pitch], 0.5, false, shortInk).bottom).toBeCloseTo(4.2)
    expect(nativeNoteMetrics([pitch], 0.25, false, shortInk).bottom).toBeCloseTo(7.56)
    const chord = nativeNoteMetrics([pitch, pitch], 0.5, false)
    const numeral = measurer.measureText('0', { fontSize: 24 })
    expect(chord.offsets[0]).toBe(0)
    expect(-chord.offsets[1]!).toBeCloseTo(numeral.inkBottom! + 24 * .12, 6)
  })
})
