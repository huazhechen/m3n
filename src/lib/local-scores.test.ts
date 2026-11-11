import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_SCORES_KEY, createLocalScoreId, isLocalScoreId, loadLocalScore, saveLocalScore, pruneExpiredLocalScoreEntries, type LocalScore } from './local-scores'

afterEach(() => vi.unstubAllGlobals())

function memoryStorage() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  vi.stubGlobal('localStorage', storage)
  return storage
}

describe('local scores', () => {
  it('reports storage failure instead of returning a saved record', () => {
    const storage = memoryStorage()
    storage.setItem = () => { throw new Error('QuotaExceededError') }
    expect(() => saveLocalScore('N: 1 2 3 4 |||')).toThrow(/保存失败/)
  })

  it('does not overwrite unreadable existing works with an empty collection', () => {
    const storage = memoryStorage()
    storage.setItem(LOCAL_SCORES_KEY, '{broken')
    expect(() => saveLocalScore('new source')).toThrow(/保留原始/)
    expect(storage.getItem(LOCAL_SCORES_KEY)).toBe('{broken')
  })

  it('updates an existing work without changing its id or creation date', () => {
    memoryStorage()
    const first = saveLocalScore('original', 100)
    const updated = saveLocalScore('revised', 200, first.id)
    expect(updated).toMatchObject({ id: first.id, createdAt: first.createdAt, source: 'revised', updatedAt: new Date(200).toISOString() })
    expect(loadLocalScore(first.id)).toEqual(updated)
  })

  it('keeps saved works permanently and preserves cleanup of legacy temporary entries', () => {
    memoryStorage()
    const saved = saveLocalScore('permanent', 100)
    expect(saved.expiresAt).toBeNull()
    expect(pruneExpiredLocalScoreEntries([saved], 100 + 365 * 86_400_000)).toEqual([saved])
  })
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
