import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { describe, expect, it } from 'vitest'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { nativeNoteBody } from './native-note-body.js'
import { NativeSymbols, line } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import type { NativePitch } from './native-model.js'

function paintedMetrics(pitches: NativePitch[], writtenBeats: number, sustain: boolean, measurer: TextMeasurer) {
  const painter = new NativeSymbols(measurer), body = nativeNoteBody(measurer), size = nativeStyle.music
  const base = 2 ** Math.floor(Math.log2(writtenBeats)), beamCount = sustain ? 0 : Math.max(0, Math.round(-Math.log2(base)))
  const bounds = pitches.map((pitch, index) => {
    let svg = sustain ? painter.sustain(0, 0) : painter.pitch(pitch, 0, 0, size, index === 0 ? beamCount : 0)
    if (index === 0) for (let beam = 0; beam < beamCount; beam++) svg += line(-body.width / 2, body.beamY(beam), body.width / 2, body.beamY(beam), body.beamStroke)
    const ink = nativeSvgInk(svg, measurer)
    return { top: -ink.top, bottom: ink.bottom }
  })
  const offsets = [0]
  if (!sustain) for (let index = 1; index < pitches.length; index++) offsets.push(offsets[index - 1]! - bounds[index - 1]!.top - size * .12 - bounds[index]!.bottom)
  return { offsets, top: Math.max(...bounds.map((bound, index) => bound.top - (offsets[index] ?? 0))), bottom: bounds[0]?.bottom ?? 0, beamCount }
}

describe('direct note metrics match actual painted primitives', () => {
  it.each([new DefaultTextMeasurer(), {
    measureText: (text: string) => ({ w: text.length * 12.34567891, advance: text.length * 11.987654321, h: 17.123456789, baseline: 13.765432198,
      inkLeft: -.234567891, inkRight: text.length * 12.123456789, inkBottom: 16.987654321, centerOffset: .123456789 }),
  }])('preserves all degrees, accidentals, octave dots, beam levels, chord stacks and sustains', measurer => {
    for (const degree of ['0', '1', '2', '3', '4', '5', '6', '7']) for (const accidental of ['', '♯', '♭', '♮', '♯♯', '♭♭'])
      for (const octave of [-3, -1, 0, 1, 3]) for (const beats of [4, 1, .75, .5, .25, .125]) for (const sustain of [false, true]) {
        const pitch = { degree, accidental, octave }
        for (const pitches of [[pitch], [pitch, { ...pitch, degree: '3', octave: octave + 1 }]])
          expect(nativeNoteMetrics(pitches, beats, sustain, measurer)).toEqual(paintedMetrics(pitches, beats, sustain, measurer))
      }
  })
})

it.each([24, 32])('reserves proportional sustain ink including round caps at music size %s', size => {
  const previous = nativeStyle.music;
  nativeStyle.music = size;
  try {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1^^ 2 |||'), { width: 480, paged: false });
    const sustains = score.projection.glyphs.filter(note => note.sustain);
    expect(sustains.length).toBeGreaterThan(0);
    for (const note of sustains) {
      expect(note.musicLeft).toBeGreaterThanOrEqual(note.inkLeft!);
      expect(note.musicRight).toBeGreaterThanOrEqual(note.inkRight!);
      expect(note.musicLeft).toBeCloseTo(size * .2 + size * .09 / 2);
    }
  } finally { nativeStyle.music = previous; }
});
