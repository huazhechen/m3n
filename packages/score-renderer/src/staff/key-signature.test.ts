import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { textMeasurer } from './layout-svg.js'
import { createStaffPreparation } from './staff-engine.js'
import { staffGlyphMetrics, staffMusicSize } from './staff-music-font.js'

const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
function signatures(key: string, previous?: string) {
  const source = previous
    ? `{key=${previous}}{4/4}\nN: 1 2 3 4 | {key=${key}}1 2 3 4 |||\nB: 1d 2d 3d 4d | 1d 2d 3d 4d |`
    : `{key=${key}}{4/4}\nN: 1 2 3 4 |||\nB: 1d 2d 3d 4d |`
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  return createStaffPreparation().measure(document.measures.at(-1)!, !previous, true, textMeasurer()).signatures
}

describe('outline-spaced key signatures', () => {
  it('interlocks the seven sharps of Guo Huo without shrinking the glyphs', () => {
    for (const signature of signatures('C#')) {
      const sharps = signature.symbols.filter(s => s.glyph === 'accidentalSharp')
      expect(sharps).toHaveLength(7)
      const width = staffGlyphMetrics('accidentalSharp').right
      expect(sharps.some((s, i) => i > 0 && s.x < sharps[i - 1]!.x + width)).toBe(true)
      expect(sharps.every(s => s.size === undefined)).toBe(true)
    }
  })

  it('reserves every accidental and the trailing gap for both clefs and key changes', () => {
    for (const previous of [undefined, 'C#', 'Cb']) for (const key of keys) {
      for (const signature of signatures(key, previous)) {
        const symbols = signature.symbols.filter(s => s.glyph.startsWith('accidental'))
        for (const symbol of symbols)
          expect(symbol.x + staffGlyphMetrics(symbol.glyph).right + staffMusicSize() / 4 * 0.3)
            .toBeLessThanOrEqual(signature.width + 1e-7)
      }
    }
  })
})
