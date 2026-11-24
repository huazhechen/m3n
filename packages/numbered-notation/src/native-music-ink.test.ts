import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { projectNativeScore } from './native-model.js'
import { NativeMusicPainter } from './native-music.js'
import { nativeSvgPieces, nativeSvgInk, unionNativeInk } from './native-ink.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { DefaultTextMeasurer } from './native-measure.js'

it('direct body geometry matches painted SVG at fractional positions, including claims and decorations', () => {
  for (const measurer of [new DefaultTextMeasurer(), {
    measureText: (text: string) => ({ w: text.length * 12.34567891, advance: text.length * 11.987654321, h: 17.123456789, baseline: 13.765432198,
      inkLeft: -.234567891, inkRight: text.length * 12.123456789, inkBottom: 16.987654321, centerOffset: .123456789 }),
  }]) {
    const document = parseM3NDocument('{4/4}\nN: 1 2#e/ 3bd// 4.. | [135] 6 7 0 | 1 - - - | 1 [1##3bb5:h]{arp}{ac(2## 3bb)}{str}{tr}{p} 3 4 |')
    const painter = new NativeMusicPainter(measurer)
    const glyphs = projectNativeScore(document, { textMeasurer: measurer }).glyphs
    for (const glyph of glyphs) for (const x of [0, -12.123456789, 534.987654321]) for (const claimed of [undefined, new Set([0, 2])]) {
      const placed = { ...glyph, x, y: x / 3 }
      expect(painter.bodyPieces(placed, claimed)).toEqual(nativeSvgPieces(painter.body(placed, claimed), measurer))
      expect(painter.musicPieces(placed, claimed)).toEqual(nativeSvgPieces(painter.music(placed, claimed), measurer))
      expect(painter.tieBodyInk(placed)).toEqual(nativeSvgInk(painter.tieBody(placed), measurer))
      expect(unionNativeInk(painter.musicPieces(placed, claimed, true))).toEqual(nativeSvgInk(painter.music(placed, claimed, true), measurer))
    }
  }
})

it('matches every pitch, octave, accidental and dotted beam level against the SVG painter', () => {
  const measurer = new DefaultTextMeasurer(), painter = new NativeMusicPainter(measurer)
  const template = projectNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |'), { textMeasurer: measurer }).glyphs[0]!
  for (const degree of ['0', '1', '2', '3', '4', '5', '6', '7']) for (const accidental of ['', '♯', '♭', '♮', '♯♯', '♭♭'])
    for (const octave of [-3, -1, 0, 1, 3]) for (const writtenBeats of [4, 1, .75, .5, .25, .125]) for (const sustain of [false, true]) {
      const pitches = [{ degree, accidental, octave }, { degree: '3', accidental, octave: octave + 1 }]
      const glyph = { ...template, pitches, writtenBeats, sustain, x: 123.123456789, y: -12.987654321,
        pitchOffsets: nativeNoteMetrics(pitches, writtenBeats, sustain, measurer).offsets }
      expect(painter.bodyPieces(glyph)).toEqual(nativeSvgPieces(painter.body(glyph), measurer))
    }
})
