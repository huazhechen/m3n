import { expect, test } from 'vitest'
import { PeakLimiter } from './peak-limiter'

test.each([44100, 48000])('limits stereo impulses and dense chords without clipping or changing stereo balance at %i Hz', rate => {
  const limiter = new PeakLimiter(rate)
  let peak = 0, audible = false
  for (let block = 0; block < 200; block++) {
    const left = Float32Array.from({ length: 128 }, (_, i) => {
      const t = (block * 128 + i) / rate
      return (block === 4 && i === 5 ? 20 : 0) + 4 * (Math.sin(t * 2764.6) + Math.sin(t * 3496.9))
    })
    const right = Float32Array.from(left, value => value / 2)
    const l = new Float32Array(128), r = new Float32Array(128)
    limiter.process(left, right, l, r)
    for (let i = 0; i < 128; i++) {
      expect(Number.isFinite(l[i]) && Number.isFinite(r[i])).toBe(true)
      peak = Math.max(peak, Math.abs(l[i]!))
      if (Math.abs(l[i]!) > 0.1) audible = true
      expect(r[i]).toBeCloseTo(l[i]! / 2, 6)
    }
  }
  expect(audible).toBe(true)
  expect(peak).toBeLessThanOrEqual(limiter.ceiling + 1e-6)
})

test('passes quiet signals with only lookahead delay and flushes to silence', () => {
  const limiter = new PeakLimiter(48000)
  const left = new Float32Array(512); left.fill(0.2, 0, 200)
  const right = Float32Array.from(left)
  const l = new Float32Array(512), r = new Float32Array(512)
  limiter.process(left, right, l, r)
  expect(l[143]).toBe(0)
  expect(l[144]).toBeCloseTo(0.2)
  expect(l[343]).toBeCloseTo(0.2)
  expect(l[344]).toBe(0)
  expect(l.subarray(344).every(value => value === 0)).toBe(true)
})
