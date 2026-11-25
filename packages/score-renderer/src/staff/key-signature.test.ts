import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { textMeasurer } from './layout-svg.js'
import { createStaffPreparation } from './staff-engine.js'
import { staffGlyphMetrics, staffMusicSize, staffSignatureAdvance } from './staff-music-font.js'

const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
function signatures(key: string, previous?: string, inline = false) {
  const source = inline
    ? `{key=${previous}}{4/4}\nN: 1 2 {key=${key}}3 4 |||\nB: 1d 2d 3d 4d |`
    : previous
    ? `{key=${previous}}{4/4}\nN: 1 2 3 4 | {key=${key}}1 2 3 4 |||\nB: 1d 2d 3d 4d | 1d 2d 3d 4d |`
    : `{key=${key}}{4/4}\nN: 1 2 3 4 |||\nB: 1d 2d 3d 4d |`
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  const prepared = createStaffPreparation().measure(document.measures.at(-1)!, !previous, true, textMeasurer())
  return inline ? prepared.entries.flatMap(lane => lane.flatMap(entry => entry.notes.map(note => note.signature))) : prepared.signatures
}

describe('uniformly spaced key signatures', () => {
  it('keeps uniform steps with only slight overlap across keys, clefs and cancellation groups', () => {
    for (const inline of [false, true]) for (const previous of [undefined, 'C#', 'Cb']) for (const key of keys) {
      if (inline && previous === undefined) continue
      for (const signature of signatures(key, previous, inline)) {
        const symbols = signature.symbols.filter(s => s.glyph.startsWith('accidental'))
        for (let i = 1; i < symbols.length; i++) {
          const current = symbols[i]!, before = symbols[i - 1]!
          const gap = current.x + staffGlyphMetrics(current.glyph).left
            - before.x - staffGlyphMetrics(before.glyph).right
          if (current.glyph === before.glyph) {
            expect(gap).toBeGreaterThanOrEqual(-staffMusicSize() / 4 * 0.08 - 1e-7)
            expect(current.x - before.x).toBeGreaterThanOrEqual(staffSignatureAdvance(current.glyph, current.y - before.y) - 1e-7)
            const step = current.x - before.x
            const first = symbols.findIndex(s => s.glyph === current.glyph)
            expect(step).toBeCloseTo(symbols[first + 1]!.x - symbols[first]!.x)
            if (current.glyph !== 'accidentalNatural') expect(gap).toBeLessThan(0)
          } else expect(gap).toBeCloseTo(staffMusicSize() / 4 * 0.6)
        }
        expect(symbols.every(s => s.size === undefined)).toBe(true)
      }
    }
  })

  it('reserves every accidental and the trailing gap for both clefs and key changes', () => {
    for (const inline of [false, true]) for (const previous of [undefined, 'C#', 'Cb']) for (const key of keys) {
      if (inline && previous === undefined) continue
      for (const signature of signatures(key, previous, inline)) {
        const symbols = signature.symbols.filter(s => s.glyph.startsWith('accidental'))
        for (const symbol of symbols)
          expect(symbol.x + staffGlyphMetrics(symbol.glyph).right + staffMusicSize() / 4 * 0.3)
            .toBeLessThanOrEqual(signature.width + 1e-7)
      }
    }
  })
})
