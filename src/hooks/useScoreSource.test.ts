import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), load: vi.fn(), work: vi.fn(), local: vi.fn(), shared: vi.fn() }))
vi.mock('../lib/samples', () => ({ presetScores: [{ slug: 'builtin' }], preparePresetScores: mocks.prepare, loadPresetScore: mocks.load }))
vi.mock('../lib/works', () => ({ loadWorkScore: mocks.work }))
vi.mock('../lib/local-scores', () => ({ isLocalScoreId: (id: string) => id.startsWith('local-'), loadLocalScore: mocks.local }))
vi.mock('../lib/shared-scores', () => ({ loadSharedScore: mocks.shared }))
import { loadScoreSource } from './useScoreSource'
afterEach(() => vi.resetAllMocks())

it('reads editor sources without preparing reading fonts, while readers retain shared preparation', async () => {
  mocks.load.mockResolvedValue('source')
  const options = { sourcesOnly: true, onProgress: vi.fn() }
  expect(await loadScoreSource('builtin', 'scores', options)).toBe('source')
  expect(mocks.prepare).toHaveBeenCalledWith(options)
  await loadScoreSource('builtin')
  expect(mocks.prepare).toHaveBeenLastCalledWith({})
})
it('does not download catalog resources for local and shared editor sources', async () => {
  mocks.local.mockReturnValue({ source: 'local' })
  mocks.shared.mockResolvedValue({ source: 'shared' })
  expect(await loadScoreSource('local-test', 'scores', { sourcesOnly: true })).toBe('local')
  expect(await loadScoreSource('shared', 'scores', { sourcesOnly: true })).toBe('shared')
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('skips work font preloads for editor sources', async () => {
  mocks.work.mockResolvedValue('work')
  expect(await loadScoreSource('work', 'works', { sourcesOnly: true })).toBe('work')
  expect(mocks.work).toHaveBeenCalledWith('work', true)
})
