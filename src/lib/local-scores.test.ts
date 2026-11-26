import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_SCORES_KEY, createLocalScoreId, isLocalScoreId, loadLocalScore, saveLocalScore } from './local-scores'

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

  it('recognizes and generates local score ids', () => {
    expect(isLocalScoreId('local-1755000000000-ab12')).toBe(true)
    expect(isLocalScoreId(undefined)).toBe(false)
    expect(isLocalScoreId('huan_le_song_01')).toBe(false)
    expect(isLocalScoreId('a1b2c3d4e5f6')).toBe(false)
    expect(isLocalScoreId(createLocalScoreId())).toBe(true)
  })

})
