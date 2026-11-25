// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), fonts: [
  { url: '/score/assets/v2/latin.woff2', as: 'font' },
  { url: '/score/assets/v2/music.woff2', as: 'font' },
  { url: '/score/assets/v2/text.woff2', as: 'font' },
] }))
vi.mock('virtual:m3n-score-catalog', () => ({
  default: [{ slug: 'test', fontPreloads: mocks.fonts }], loadScoreSource: mocks.load,
}))
import { loadPresetScore } from './samples'

afterEach(() => { document.head.replaceChildren(); vi.resetAllMocks() })

it('starts all score fonts while the score source is still pending and reuses preloads', async () => {
  let complete!: (source: string) => void
  const source = new Promise<string>(resolve => { complete = resolve })
  mocks.load.mockImplementation(() => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')]
    expect(links.map(link => new URL(link.href).pathname)).toEqual(mocks.fonts.map(font => font.url))
    expect(links.every(link => link.as === 'font' && link.crossOrigin === 'anonymous')).toBe(true)
    return source
  })
  const first = loadPresetScore('test')
  const repeated = loadPresetScore('test')
  expect(mocks.load).toHaveBeenCalledTimes(2)
  expect(document.querySelectorAll('link[rel="preload"]')).toHaveLength(3)
  complete('{title=Test}\n1 2 3 4')
  expect(await first).toBe(await repeated)
})

it('retries a failed font preload when reopening the score', async () => {
  mocks.load.mockResolvedValue('source')
  await loadPresetScore('test')
  const failed = document.querySelector<HTMLLinkElement>('link[rel="preload"]')!
  failed.dispatchEvent(new Event('error'))
  expect(document.querySelectorAll('link[rel="preload"]')).toHaveLength(2)
  await loadPresetScore('test')
  expect(document.querySelectorAll('link[rel="preload"]')).toHaveLength(3)
  expect(failed.isConnected).toBe(false)
})
