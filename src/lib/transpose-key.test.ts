import { describe, expect, it } from 'vitest'
import { currentKeyIndex, keyPitchClass, nearestKeyTranspose, TRANSPOSE_KEYS } from './transpose-key'

describe('key selection', () => {
  it('chooses the shortest shift for all 144 original and target keys', () => {
    for (const original of TRANSPOSE_KEYS) for (let target = 0; target < 12; target++) {
      const shift = nearestKeyTranspose(original, target)
      expect(currentKeyIndex(original, shift)).toBe(target)
      expect(shift).toBeGreaterThanOrEqual(-5)
      expect(shift).toBeLessThanOrEqual(6)
      expect(Math.abs(shift)).toBeLessThanOrEqual(Math.abs(shift - 12))
      expect(Math.abs(shift)).toBeLessThanOrEqual(Math.abs(shift + 12))
    }
  })
  it('recognizes enharmonic spellings and octave suffixes', () => {
    for (const [key, pitch] of [['C#', 1], ['Db4', 1], ['F♯', 6], ['B♭', 10], ['Cb', 11], ['B#', 0]] as const) expect(keyPitchClass(key)).toBe(pitch)
    expect(nearestKeyTranspose('B', 0)).toBe(1)
    expect(nearestKeyTranspose('C', 11)).toBe(-1)
    expect(nearestKeyTranspose('C', 6)).toBe(6)
  })
  it('bases repeated selections on the original key and displays legacy octave shifts', () => {
    expect(nearestKeyTranspose('D', 11)).toBe(-3)
    expect(nearestKeyTranspose('D', 0)).toBe(-2)
    expect(nearestKeyTranspose('D', 2)).toBe(0)
    expect(currentKeyIndex('D', 12)).toBe(2)
    expect(currentKeyIndex('D', -12)).toBe(2)
  })
})
