import { expect, it } from 'vitest'
import { playbackScrollDelta } from './score-playback-follow'

it('keeps visible rows still and reveals rows hidden by either toolbar', () => {
  expect(playbackScrollDelta(150, 250, 80, 900)).toBe(0)
  expect(playbackScrollDelta(850, 950, 80, 900)).toBe(50)
  expect(playbackScrollDelta(40, 140, 80, 900)).toBe(-40)
})
it('aligns oversized rows once without oscillating between their edges', () => {
  expect(playbackScrollDelta(200, 1200, 80, 900)).toBe(120)
  expect(playbackScrollDelta(80, 1080, 80, 900)).toBe(0)
})
it('follows backward repeat jumps and uses the larger immersive viewport', () => {
  expect(playbackScrollDelta(-300, -200, 80, 900)).toBe(-380)
  expect(playbackScrollDelta(900, 980, 12, 1021)).toBe(0)
})
