import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasure, staffRhythmicSpacing, staffSpacingPositions, STAFF_SCALE } from './staff-engine.js'
import { staffGlyphMetrics, staffMusicSize } from './staff-music-font.js'
const measure = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
const model = (music: string, first = false, spacing = .8) => {
  const doc = projectStaffDocument(analyzeM3N(`{4/4}\nN: 1 2 3 4 | ${music}`).score)
  return createStaffMeasure(doc.measures[1]!, first, false, measure, spacing)
}

it('normalizes both real bar gaps by one quarter regardless of the final note duration', () => {
  for (const music of ['1 2 3 4 |', '1^ 2^ |', '1^^ |']) for (const extra of [0, 80]) {
    const m = model(music), xs = staffSpacingPositions(m.prepared, .8, extra)
    const result = staffRhythmicSpacing(m.prepared, .8, extra)
    expect(result.gaps).toHaveLength(xs.length + 1)
    const first = xs[0]! - m.metrics.columns[0]!.left
    const last = m.minimum + extra - m.start - m.endInset - xs.at(-1)! - m.metrics.columns.at(-1)!.after
    expect(result.gaps[0]).toBeCloseTo(first * STAFF_SCALE, 8)
    expect(result.gaps.at(-1)).toBeCloseTo(last * STAFF_SCALE, 8)
    for (const gap of result.gaps) expect(gap).toBeCloseTo(result.gaps[0]!, 8)
  }
})

it('keeps row-start clearance fixed at 1S while only real inner/bar intervals stretch and score', () => {
  const m = model('1# 2 3 4 |', true)
  const xs = staffSpacingPositions(m.prepared, .8, 0), stretched = staffSpacingPositions(m.prepared, .8, 100)
  expect(stretched[0]).toBe(xs[0])
  expect(staffRhythmicSpacing(m.prepared, .8, 0).gaps).toHaveLength(xs.length)
  const right = Math.max(...m.prepared.signatures.flatMap(s => s.symbols.map(v => v.x + staffGlyphMetrics(v.glyph, v.size).right)))
  expect((m.start + xs[0]! - m.metrics.columns[0]!.left - right) * STAFF_SCALE).toBeCloseTo(scoreLayoutConfig.staff.space, 8)
})

it('does not create samples for invisible exterior edges', () => {
  const m = model('1 2 3 4 |', true)
  const prepared = { ...m.prepared, metrics: { ...m.metrics, closing: false } }
  const data = staffRhythmicSpacing(prepared, .8, 0)
  expect(data.gaps).toHaveLength(3)
  expect(data.weight).toBeCloseTo(3)
})

it('preserves 75:25 note-pair direction while sharing the numbered beam coefficient', () => {
  const m = model('(1 2) 3 4 |')
  const head = staffGlyphMetrics('noteheadBlack'), unit = staffMusicSize() / 4 * scoreLayoutConfig.staff.spacingIncrementSpaces
  const weight = (m.metrics.columns[1]!.naturalAdvance - head.right + head.left) / unit
  expect(weight).toBeCloseTo(Math.sqrt(.5) ** .75, 8)
  expect(scoreLayoutConfig.staff.groupSpacingRatio).toBe(scoreLayoutConfig.numbered.groupSpacingRatio)
})
