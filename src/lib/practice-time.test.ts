import { afterEach, expect, it, vi } from 'vitest'
import { addPracticeTime, formatPracticeTime, localDay, readPracticeDays } from './practice-time'
afterEach(() => vi.unstubAllGlobals())
it('splits practice at local midnight and preserves previous days', () => {
  const start = new Date(2026, 10, 23, 23, 59, 58).getTime()
  const end = new Date(2026, 10, 24, 0, 0, 3).getTime()
  expect(addPracticeTime({ '2026-11-22': 500 }, start, end)).toEqual({ '2026-11-22': 500, '2026-11-23': 2000, '2026-11-24': 3000 })
  expect(localDay(new Date(start))).toBe('2026-11-23')
})
it('formats hours without wrapping and ignores backwards time', () => {
  expect(formatPracticeTime(90061000)).toBe('25:01:01')
  expect(addPracticeTime({}, 500, 100)).toEqual({})
})
it('rejects corrupt local records and handles unavailable storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{"2026-11-23":2000,"bad":300,"2026-11-24":-1,"2026-11-25":"1"}' })
  expect(readPracticeDays()).toEqual({ '2026-11-23': 2000 })
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') } })
  expect(readPracticeDays()).toEqual({})
})
