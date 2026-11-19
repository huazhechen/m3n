import { afterEach, expect, test, vi } from 'vitest'
import { SAMPLED_TONE_URLS } from './sampled-tone-assets'

const valid = new TextEncoder().encode('RIFF1234sfbkpayload').buffer
new DataView(valid).setUint32(4, valid.byteLength - 8, true)
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
function setup() {
  const entries = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()) }),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
  const fetcher = vi.fn(async () => new Response(valid.slice(0), { headers: { 'Content-Length': String(valid.byteLength) } }))
  vi.stubGlobal('fetch', fetcher)
  return { entries, cache, fetcher }
}
test('downloads only the selected instrument, deduplicates and returns independent transferable buffers', async () => {
  setup()
  const { loadSampledTone, subscribeToneLoadProgress } = await import('./playback-tones')
  const updates: unknown[] = []
  const unsubscribe = subscribeToneLoadProgress(value => updates.push(value))
  const [a, b] = await Promise.all([loadSampledTone('piano'), loadSampledTone('piano')])
  expect(a).not.toBe(b); expect(new Uint8Array(a)).toEqual(new Uint8Array(b))
  structuredClone(a, { transfer: [a] })
  expect((await loadSampledTone('piano')).byteLength).toBe(valid.byteLength)
  expect(updates).toContainEqual({ tone: 'piano', completed: valid.byteLength, total: valid.byteLength, stage: 'download' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(new URL(SAMPLED_TONE_URLS.piano, import.meta.url).href, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  unsubscribe()
})
test('reads the persistent sampled bank after a module reload without a network request', async () => {
  setup()
  await (await import('./playback-tones')).loadSampledTone('flute')
  vi.resetModules()
  const restored = await (await import('./playback-tones')).loadSampledTone('flute')
  expect(new Uint8Array(restored)).toEqual(new Uint8Array(valid))
  expect(fetch).toHaveBeenCalledTimes(1)
})
test('replaces corrupt cache entries and retries failed downloads', async () => {
  const { entries, cache, fetcher } = setup()
  const module = await import('./playback-tones')
  const key = new URL(SAMPLED_TONE_URLS.guitar, import.meta.url).href
  entries.set(key, new Response('broken'))
  fetcher.mockRejectedValueOnce(new Error('failed'))
  await expect(module.loadSampledTone('guitar')).rejects.toThrow('failed')
  expect(cache.delete).toHaveBeenCalledWith(key)
  await module.loadSampledTone('guitar')
  expect(fetch).toHaveBeenCalledTimes(2)
})
test('cancels a download and allows a fresh request without stale progress or cached partial data', async () => {
  const { cache, fetcher } = setup()
  let signal: AbortSignal | undefined
  fetcher.mockImplementationOnce((_url?: unknown, options?: RequestInit) => new Promise((_resolve, reject) => {
    signal = options?.signal ?? undefined
    signal?.addEventListener('abort', () => reject(signal!.reason))
  }))
  const module = await import('./playback-tones')
  const request = module.loadSampledTone('violin')
  const cancelled = expect(request).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(signal).toBeDefined())
  module.cancelToneLoad('violin'); await cancelled
  expect(cache.put).not.toHaveBeenCalled()
  await module.loadSampledTone('violin')
  expect(fetch).toHaveBeenCalledTimes(2)
})
test('storage restrictions do not prevent downloads or memory reuse', async () => {
  setup(); vi.stubGlobal('caches', { open: async () => { throw new Error('private mode') } })
  const module = await import('./playback-tones')
  await module.loadSampledTone('harmonica'); await module.loadSampledTone('harmonica')
  expect(fetch).toHaveBeenCalledTimes(1)
})
test('supports unknown download length without reporting a fake percentage', async () => {
  const { fetcher } = setup()
  fetcher.mockResolvedValueOnce(new Response(valid.slice(0)))
  const module = await import('./playback-tones')
  const updates: unknown[] = []
  module.subscribeToneLoadProgress(value => updates.push(value))
  await module.loadSampledTone('flute')
  expect(updates).toContainEqual({ tone: 'flute', completed: valid.byteLength, total: 0, stage: 'download' })
})
test.each([new Response('broken'), new Response(null, { status: 404 })])('rejects invalid or missing assets without persisting them', async response => {
  const { cache, fetcher } = setup()
  fetcher.mockResolvedValueOnce(response)
  await expect((await import('./playback-tones')).loadSampledTone('piano')).rejects.toThrow()
  expect(cache.put).not.toHaveBeenCalled()
})

test('reports intermediate byte counts before a streamed response completes', async () => {
  const { fetcher } = setup()
  let stream!: ReadableStreamDefaultController<Uint8Array>
  fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller } }), {
    headers: { 'Content-Length': String(valid.byteLength) },
  }))
  const module = await import('./playback-tones')
  const updates: unknown[] = []
  module.subscribeToneLoadProgress(value => updates.push(value))
  const request = module.loadSampledTone('piano')
  stream.enqueue(new Uint8Array(valid.slice(0, 8)))
  await vi.waitFor(() => expect(updates).toContainEqual({ tone: 'piano', completed: 8, total: valid.byteLength, stage: 'download' }))
  expect(updates).not.toContainEqual({ tone: 'piano', completed: 1, total: 1, stage: 'ready' })
  stream.enqueue(new Uint8Array(valid.slice(8))); stream.close()
  expect(new Uint8Array(await request)).toEqual(new Uint8Array(valid))
})
