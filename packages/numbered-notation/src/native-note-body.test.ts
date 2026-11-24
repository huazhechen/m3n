// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NativeSymbols } from './native-symbols.js'
import { NativeMusicPainter, nativeBeamLayout } from './native-music.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

const root = (svg: string) => new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
const pitch = { degree: '1', accidental: '', octave: 0 }

describe('note decorations clear measured font edges', () => {
  // Include both ordinary digits and an unusual font with deep descenders.
  for (const [ascent, descent] of [[16, 0], [8, 9]]) {
    const measurer: TextMeasurer = { measureText: () => ({ w: 12, h: ascent! + descent!, baseline: ascent! }) }
    it.each([11, 22, 33])(`places octave stacks from ink edges (${ascent}/${descent}) at %spx`, size => {
      const painter = new NativeSymbols(measurer)
      for (const octave of [1, 2, -1, -2]) {
        const svg = root(painter.pitch({ ...pitch, octave }, 0, 0, size))
        const dots = [...svg.querySelectorAll('[data-m3n-role="music-dot"]')].map(c => nativeSvgInk(c.outerHTML, measurer))
        const text = nativeSvgInk(svg.querySelector('text')!.outerHTML, measurer)
        const clearance = octave > 0 ? text.top - dots[0]!.bottom : dots[0]!.top - text.bottom
        expect(clearance).toBeCloseTo(size * (octave > 0 ? .08 : .12), 3)
        if (dots.length > 1) expect(Math.abs(dots[1]!.top - dots[0]!.top)).toBeCloseTo(size * .23, 3)
      }
    })
    it(`aligns attached dots and all beam levels with the measured body (${ascent}/${descent})`, () => {
      const layout = layoutNativeScore(parseM3NDocument('{6/8}\nN: (1d 2 3) (4 5 6) |||'), { width: 800, paged: false, textMeasurer: measurer })
      const glyph = { ...layout.projection.glyphs[0]!, x: 0, y: 0 }
      const painter = new NativeMusicPainter(measurer)
      for (const beats of [.5, .25, .125]) {
        const a = { ...glyph, writtenBeats: beats, beats, time: 0 }
        const svg = root(painter.body(a)), beams = [...svg.querySelectorAll('line')]
        const text = nativeSvgInk(svg.querySelector('text')!.outerHTML, measurer)
        const firstBeam = nativeSvgInk(beams[0]!.outerHTML, measurer)
        expect(firstBeam.top - text.bottom).toBeCloseTo(22 * .12, 4)
        const lastBeam = nativeSvgInk(beams.at(-1)!.outerHTML, measurer)
        const dot = nativeSvgInk(svg.querySelector('[data-m3n-role="music-dot"]')!.outerHTML, measurer)
        expect(dot.top - lastBeam.bottom).toBeCloseTo(22 * .08, 4)
        const metrics = nativeNoteMetrics(a.pitches, beats, false, measurer)
        const ink = nativeSvgInk(svg.documentElement.innerHTML, measurer)
        expect(metrics.top).toBeCloseTo(-ink.top, 4)
        expect(metrics.bottom).toBeCloseTo(ink.bottom, 4)
        const join = root(nativeBeamLayout([a, { ...a, x: 40, time: beats }], measurer).svg)
        expect([...join.querySelectorAll('line')].map(l => l.getAttribute('y1'))).toEqual(beams.map(l => l.getAttribute('y1')))
      }
      const dotted = root(painter.body({ ...glyph, pitches: [pitch], writtenBeats: 1.5 }))
      const dot = nativeSvgInk(dotted.querySelector('[data-m3n-role="music-dot"]')!.outerHTML, measurer)
      const text = nativeSvgInk(dotted.querySelector('text')!.outerHTML, measurer)
      expect((dot.top + dot.bottom) / 2 - text.top).toBeCloseTo((ascent! + descent!) * .64, 4)
    })
  }
})
