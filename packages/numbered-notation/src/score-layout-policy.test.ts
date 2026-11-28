import { expect, it } from 'vitest'
import { A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { scoreLayoutConfig } from './score-layout-config.js'
import { scoreVerticalSpacing, scoreVerticalCost, scoreRhythmicGapWeight } from './layout/policy.js'

it('preserves the configured staff space and physical print readability', () => {
  const staffHeight = scoreLayoutConfig.staff.music
  expect(staffHeight / 4).toBe(7.5)
  const widestAutomaticWidth = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.maximumMultiple
  expect(staffHeight / 4 * A4_CONTENT_WIDTH_MM / widestAutomaticWidth).toBeGreaterThanOrEqual(1.6)
})
it('uses notation-specific vertical bounds with shared comfort proportions', () => {
  for (const notation of ['numbered', 'staff'] as const) {
    const spacing = scoreVerticalSpacing(notation)
    expect(spacing.minimum).toBeCloseTo(notation === 'staff' ? 2 * scoreLayoutConfig.staff.space : .75 * scoreLayoutConfig.numbered.music)
    expect(spacing.comfortable).toBeCloseTo(spacing.minimum * 1.5)
    expect(spacing.maximum).toBeCloseTo(spacing.minimum * 2)
    expect(scoreVerticalCost(spacing.minimum, spacing)).toBeCloseTo(1)
    expect(scoreVerticalCost(spacing.comfortable, spacing)).toBe(0)
    expect(scoreVerticalCost(spacing.maximum, spacing)).toBe(0)
  }
})

it('gives onset duration the larger share while keeping equal durations and controls stable', () => {
  expect(scoreRhythmicGapWeight(1, 1)).toBe(1)
  expect(scoreRhythmicGapWeight(undefined, undefined)).toBe(1)
  expect(scoreRhythmicGapWeight(0, 0)).toBe(1)
  expect(scoreRhythmicGapWeight(.5, .5, .5)).toBeCloseTo(Math.sqrt(.5) * .5)
  expect(scoreRhythmicGapWeight(.5, .5, .75)).toBeCloseTo(Math.sqrt(.5) * .75)
  expect(scoreRhythmicGapWeight(1.5, .5) / scoreRhythmicGapWeight(.5, 1.5)).toBeCloseTo(3 ** .25)
  expect(scoreRhythmicGapWeight(.5, 1)).toBeLessThan(scoreRhythmicGapWeight(1, .5))
})

it('supports equal duration shares for numbered spacing without changing staff defaults', () => {
  expect(scoreRhythmicGapWeight(1.5, .5, 1, .5)).toBeCloseTo(.75 ** .25)
  expect(scoreRhythmicGapWeight(.5, 1.5, 1, .5)).toBeCloseTo(.75 ** .25)
  expect(scoreRhythmicGapWeight(.5, .5, .75, .5)).toBeCloseTo(Math.sqrt(.5) * .75)
})

it('keeps shared gaps and type fixed when S changes, while staff geometry scales', () => {
  const staff = scoreLayoutConfig.staff, previous = staff.space
  const shared = () => ({ vertical: scoreVerticalSpacing('numbered'), attachment: staff.attachmentGap,
    lyric: staff.lyricGap, annotation: staff.annotationGap, chord: staff.chordGap,
    title: staff.title, text: staff.text, tuplet: staff.tupletFontSize })
  try {
    const before = shared(), bass = staff.engine.bassY, vertical = scoreVerticalSpacing('staff')
    staff.space *= 1.5
    expect(shared()).toEqual(before)
    expect(scoreVerticalSpacing('staff')).toEqual({ minimum: vertical.minimum * 1.5, comfortable: vertical.comfortable * 1.5, maximum: vertical.maximum * 1.5 })
    expect(staff.engine.bassY).toBeCloseTo(bass * 1.5)
    expect(staff.music).toBeCloseTo(4 * staff.space)
  } finally { staff.space = previous }
})
