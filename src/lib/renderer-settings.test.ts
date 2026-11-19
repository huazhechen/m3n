import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { clampPlaybackBpm, PLAYBACK_BPM_KEY, readPlaybackBpm, readNotationMode, writeNotationMode } from './renderer-settings'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

test('BPM settings use a new key and never reinterpret stored speed percentages', () => {
  localStorage.setItem('m3n:playback-speed', '75')
  expect(readPlaybackBpm()).toBeNull()
  localStorage.setItem(PLAYBACK_BPM_KEY, '137')
  expect(readPlaybackBpm()).toBe(137)
})

test('BPM settings accept the full range and reject invalid stored values', () => {
  for (const value of [10, 137, 240]) {
    localStorage.setItem(PLAYBACK_BPM_KEY, String(value))
    expect(readPlaybackBpm()).toBe(value)
  }
  for (const value of ['', 'bad', 'NaN', '0']) {
    localStorage.setItem(PLAYBACK_BPM_KEY, value)
    expect(readPlaybackBpm()).toBeNull()
  }
  expect(clampPlaybackBpm(1)).toBe(10)
  expect(clampPlaybackBpm(999)).toBe(240)
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
