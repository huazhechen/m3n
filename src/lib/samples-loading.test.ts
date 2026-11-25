// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), prepare: vi.fn() }))
vi.mock('virtual:m3n-score-catalog', () => ({
  default: [{ slug: 'test', sourcePath: 'test.m3n' }], loadScoreSource: mocks.load,
  prepareCatalogResources: mocks.prepare, initializeCatalog: async () => {},
}))
import { loadPresetScore, preparePresetScores } from './samples'

afterEach(() => { vi.resetAllMocks() })

it('reads sources from the shared catalog without starting per-score font preloads', async () => {
  mocks.load.mockResolvedValue('source')
  expect(await loadPresetScore('test')).toBe('source')
  expect(document.querySelectorAll('link[rel="preload"]')).toHaveLength(0)
  expect(mocks.load).toHaveBeenCalledWith({ slug: 'test', sourcePath: 'test.m3n' })
  expect(await loadPresetScore('missing')).toBeNull()
  expect(mocks.load).toHaveBeenCalledOnce()
})

it('exposes shared preparation with byte progress and cancellation', async () => {
  const options = { signal: new AbortController().signal, onProgress: vi.fn() }
  await preparePresetScores(options)
  expect(mocks.prepare).toHaveBeenCalledWith(options)
})
