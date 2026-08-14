import { describe, expect, it } from 'vitest'
import { createLocalScoreId, isLocalScoreId, pruneExpiredLocalScoreEntries, type LocalScore } from './local-scores'

describe('local scores', () => {
  it('recognizes and generates local score ids', () => {
    expect(isLocalScoreId('local-1755000000000-ab12')).toBe(true)
    expect(isLocalScoreId(undefined)).toBe(false)
    expect(isLocalScoreId('huan_le_song_01')).toBe(false)
    expect(isLocalScoreId('a1b2c3d4e5f6')).toBe(false)
    expect(isLocalScoreId(createLocalScoreId())).toBe(true)
  })

  it('prunes expired entries', () => {
    const entries: LocalScore[] = [
      { id: 'local-1', source: 'a', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: 200 },
      { id: 'local-2', source: 'b', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: 150 },
      { id: 'local-3', source: 'c', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: 100 },
    ]
    expect(pruneExpiredLocalScoreEntries(entries, 150).map((entry) => entry.id)).toEqual(['local-1'])
    expect(pruneExpiredLocalScoreEntries(entries, 200)).toEqual([])
  })
})
