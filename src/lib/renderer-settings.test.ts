import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { scoreWidthMultiple, scoreWidthAtMultiple, clampPlaybackBpm, clampScoreWidth, stepScoreWidth, PLAYBACK_BPM_KEY, readPlaybackBpm, readNotationMode, writeNotationMode } from './renderer-settings'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

test('manual widths use 20–40 multiples, independently from the eleven search levels', () => {
  expect(stepScoreWidth(610, -1)).toBe(606)
  expect(stepScoreWidth(610, 1)).toBe(612)
  expect(stepScoreWidth(600, -1)).toBe(594)
  expect(stepScoreWidth(600, 1)).toBe(606)
  expect(stepScoreWidth(480, -1)).toBe(480)
  expect(stepScoreWidth(960, 1)).toBe(960)
  expect(clampScoreWidth(2560)).toBe(960)
  expect(clampScoreWidth(200)).toBe(480)
  expect(clampScoreWidth(610)).toBe(612)
  expect(clampScoreWidth(NaN)).toBe(720)
  for (let multiple = 20; multiple <= 40; multiple += .25) {
    const width = 24 * multiple
    expect(scoreWidthAtMultiple(multiple)).toBe(width)
    expect(scoreWidthMultiple(width)).toBe(multiple)
  }
})

test('BPM settings use a new key and never reinterpret stored speed percentages', () => {
  localStorage.setItem('m3n:playback-speed', '75')
  expect(readPlaybackBpm()).toBeNull()
  localStorage.setItem(PLAYBACK_BPM_KEY, '137')
  expect(readPlaybackBpm()).toBe(137)
})

test('BPM settings accept the full range and reject invalid stored values', () => {
  for (const value of [10, 137, 240, 300, 360]) {
    localStorage.setItem(PLAYBACK_BPM_KEY, String(value))
    expect(readPlaybackBpm()).toBe(value)
  }
  for (const value of ['', 'bad', 'NaN', '0']) {
    localStorage.setItem(PLAYBACK_BPM_KEY, value)
    expect(readPlaybackBpm()).toBeNull()
  }
  expect(clampPlaybackBpm(1)).toBe(10)
  expect(clampPlaybackBpm(999)).toBe(360)
})


test('notation selection migrates fixed do and gives the explicit three-state preference priority', () => {
  expect(readNotationMode()).toBe('movable')
  localStorage.setItem('m3n:fixed-do', '1')
  expect(readNotationMode()).toBe('fixed')
  for (const mode of ['staff', 'movable', 'fixed'] as const) {
    writeNotationMode(mode)
    expect(readNotationMode()).toBe(mode)
  }
  localStorage.setItem('m3n:notation-mode', 'invalid')
  expect(readNotationMode()).toBe('fixed')
})

test('notation selection remains available without local storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable') }, setItem: () => { throw new Error('unavailable') } })
  expect(readNotationMode()).toBe('movable')
  expect(() => writeNotationMode('staff')).not.toThrow()
})
