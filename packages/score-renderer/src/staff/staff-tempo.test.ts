import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { describe, expect, it } from 'vitest'
import { staffTempoBeat } from './staff-tempo.js'
import { SvgGeometry, xml, type MeasureText } from './layout-svg.js'

const measure: MeasureText = (_text, size) => ({ width: size, left: 0, right: size, ascent: size * .7, descent: 0 })

describe('staff metronome notes', () => {
  it.each([1, 2, 4, 8, 16, 32, 64, 128])('uses complete font notes and dots for beat unit %s', unit => {
    for (const dots of [0, 1, 2]) {
      const beat = staffTempoBeat(unit, dots, 17, 31, 16, measure)
      const svg = xml(beat.node), ink = new SvgGeometry(beat.node, measure).ink(beat.node)
      expect(svg).toContain('data-m3n-glyph="metNote')
      expect(svg.match(/data-m3n-glyph="metAugmentationDot"/g) ?? []).toHaveLength(dots)
      expect(svg).not.toMatch(/<(?:path|circle)\b/)
      expect(ink.left).toBeCloseTo(17)
      expect(ink.bottom).toBeCloseTo(31)
      expect(beat.textX - ink.right).toBeCloseTo(16 * .7 * .35 * scoreLayoutConfig.staff.musicSizeRatio)
    }
  })

  it('keeps a compact quarter-note height relative to numeric ink and scales uniformly', () => {
    const small = staffTempoBeat(4, 0, 0, 0, 16, measure)
    const large = staffTempoBeat(4, 0, 0, 0, 32, measure)
    const a = new SvgGeometry(small.node, measure).ink(small.node)
    const b = new SvgGeometry(large.node, measure).ink(large.node)
    expect(a.bottom - a.top).toBeCloseTo(14 * scoreLayoutConfig.staff.musicSizeRatio)
    expect(b.bottom - b.top).toBeCloseTo(28 * scoreLayoutConfig.staff.musicSizeRatio)
    expect(b.right).toBeCloseTo(a.right * 2)
    expect(large.textX).toBeCloseTo(small.textX * 2)
  })
})

it('scales the metronome note and dots with staff spaces while retaining the numeric baseline', () => {
  const original = scoreLayoutConfig.staff.music
  try {
    scoreLayoutConfig.staff.music = 28
    const small = staffTempoBeat(8, 2, 0, 31, 16, measure)
    const a = new SvgGeometry(small.node, measure).ink(small.node)
    scoreLayoutConfig.staff.music = 32
    const large = staffTempoBeat(8, 2, 0, 31, 16, measure)
    const b = new SvgGeometry(large.node, measure).ink(large.node)
    expect(b.right - b.left).toBeCloseTo((a.right - a.left) * 8 / 7)
    expect(b.bottom - b.top).toBeCloseTo((a.bottom - a.top) * 8 / 7)
    expect(b.bottom).toBeCloseTo(a.bottom)
    expect(large.textX).toBeCloseTo(small.textX * 8 / 7)
  } finally { scoreLayoutConfig.staff.music = original }
})
