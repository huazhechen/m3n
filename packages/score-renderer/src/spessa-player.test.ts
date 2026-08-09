import { describe, expect, it } from 'vitest' 
import { seekTimeAtProgress } from './spessa-player'

describe('score MIDI playback', () => {
  it('keeps seeks just before the end of a sequence', () => {
    expect(seekTimeAtProgress(12, 1)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, 2)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, -1)).toBe(0)
  })
})
