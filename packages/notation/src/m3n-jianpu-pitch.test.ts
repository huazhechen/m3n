import { describe, expect, it } from 'vitest'
import { jianpuKeyNumber, m3nPitchToMidi } from './m3n-jianpu-pitch.js'

describe('M3N Jianpu pitch utilities', () => {
  it('maps M3N pitches and tonic keys without a render data model', () => {
    expect(m3nPitchToMidi('1', 'C')).toBe(60)
    expect(m3nPitchToMidi('1', 'G')).toBe(67)
    expect(jianpuKeyNumber('C')).toBe(0)
    expect(jianpuKeyNumber('Bb')).toBe(10)
  })
})
