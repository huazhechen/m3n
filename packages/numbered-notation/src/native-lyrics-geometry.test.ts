// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'
import { NativeSymbols, line } from './native-symbols.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { NativeNumberedNotationScore } from './native-score.js'

const options = { width: 800, paged: false }
const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||\nL: 春天在哪里 | 就在这里呀')
describe('native lyric and music lower envelopes', () => {
  it('places lyrics after the musical body without adding barline height', () => {
    const score = layoutNativeScore(document, options), first = score.systems[0]!.lanes[0]!
    expect(first.bodyBottom).toBeCloseTo(7.15)
    expect(first.lyricBottom).toBeCloseTo(4.4)
    expect(first.bottom).toBeCloseTo(4.4 + 7.04 + 18.04)
    const svg = NativeNumberedNotationScore.create(document).render(options).join('')
    const root = new DOMParser().parseFromString(svg, 'text/html')
    const lyric = root.querySelector('[data-m3n-role="lyric"]')!
    expect(Number(lyric.getAttribute('y')) - first.y).toBeCloseTo(4.4 + 7.04 + 18.04 * 0.8, 4)
    const second = score.systems[1]!.lanes[0]!
    expect(second.y - first.y).toBeCloseTo(first.bottom + 24 + second.top)
  })

  it('uses beam and low-octave geometry when that body extends farther', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: (1d 2) 3 4 5 |||\nL: 春天在哪里'), options)
    const lane = score.systems[0]!.lanes[0]!
    expect(lane.lyricBottom).toBeCloseTo(8.91)
    expect(lane.bodyBottom).toBeCloseTo(8.91)
  })

  it('keeps uniform systems and their lyrics on the same reserved body envelope', () => {
    const score = layoutNativeScore(document, { ...options, uniformSystemHeight: true })
    for (const system of score.systems) {
      const lane = system.lanes[0]!
      expect(lane.lyricBottom).toBe(lane.bodyBottom)
      expect(lane.bottom).toBeCloseTo(lane.bodyBottom! + 25.08)
    }
  })

  it('unions the actually painted number and beams, including conservative offline font bounds', () => {
    const pitch = { degree: '1', accidental: '', octave: 0 }, measurer = new DefaultTextMeasurer()
    const painter = new NativeSymbols(measurer)
    for (const beats of [1, 0.5, 0.25]) {
      const metrics = nativeNoteMetrics([pitch], beats, false, measurer)
      let svg = painter.pitch(pitch, 0, 0, 22, metrics.beamCount)
      for (let beam = 0; beam < metrics.beamCount; beam++) svg += line(-6, 3.245 + beam * 3.08, 7, 3.245 + beam * 3.08, 1.21)
      expect(metrics.bottom).toBeCloseTo(nativeSvgInk(svg, measurer).bottom, 8)
    }
    // A short real digit must not inherit the fallback font's nominal descent.
    const shortInk = { measureText: () => ({ w: 11, h: 15, baseline: 15 }) }
    expect(nativeNoteMetrics([pitch], 0.5, false, shortInk).bottom).toBeCloseTo(3.85)
    expect(nativeNoteMetrics([pitch], 0.25, false, shortInk).bottom).toBeCloseTo(6.93)
    const chord = nativeNoteMetrics([pitch, pitch], 0.5, false)
    expect(chord.offsets).toEqual([0, -24.64])
  })
})
