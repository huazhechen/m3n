import { afterEach, expect, test, vi } from 'vitest'

const valid = new TextEncoder().encode('RIFF1234sfbkpayload')

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function setupCache() {
  const entries = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()) }),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
  return { entries, cache }
}

test('deduplicates downloads and returns independent transferable buffers', async () => {
  setupCache()
  const fetch = vi.fn(async () => new Response(valid))
  vi.stubGlobal('fetch', fetch)
  const { loadSampledTone } = await import('./playback-tones')
  const [first, second] = await Promise.all([loadSampledTone('piano'), loadSampledTone('piano')])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(first).not.toBe(second)
  new Uint8Array(first).fill(0)
  expect(new Uint8Array(second)).toEqual(valid)
  await loadSampledTone('piano')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('uses durable cached samples after the module has been reloaded', async () => {
  const { cache } = setupCache()
  const fetch = vi.fn(async () => new Response(valid))
  vi.stubGlobal('fetch', fetch)
  await (await import('./playback-tones')).loadSampledTone('piano')
  expect(cache.put).toHaveBeenCalledTimes(1)
  vi.resetModules()
  fetch.mockRejectedValue(new Error('offline'))
  expect(new Uint8Array(await (await import('./playback-tones')).loadSampledTone('piano'))).toEqual(valid)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('failed requests can be retried without caching an error response', async () => {
  const { cache } = setupCache()
  const fetch = vi.fn().mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockResolvedValueOnce(new Response(valid))
  vi.stubGlobal('fetch', fetch)
  const { loadSampledTone } = await import('./playback-tones')
  await expect(loadSampledTone('piano')).rejects.toThrow('无法下载钢琴')
  expect(cache.put).not.toHaveBeenCalled()
  await expect(loadSampledTone('piano')).resolves.toBeInstanceOf(ArrayBuffer)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('refuses HTML fallback pages and replaces corrupt cached data', async () => {
  const { cache } = setupCache()
  cache.match.mockResolvedValueOnce(new Response('corrupt'))
  const fetch = vi.fn().mockResolvedValueOnce(new Response('<html>missing</html>'))
    .mockResolvedValueOnce(new Response(valid))
  vi.stubGlobal('fetch', fetch)
  const { loadSampledTone } = await import('./playback-tones')
  await expect(loadSampledTone('piano')).rejects.toThrow('音色文件无效')
  expect(cache.delete).toHaveBeenCalledTimes(1)
  expect(cache.put).not.toHaveBeenCalled()
  await expect(loadSampledTone('piano')).resolves.toBeInstanceOf(ArrayBuffer)
})

test('plays with memory caching when browser storage is unavailable or full', async () => {
  const { cache } = setupCache()
  cache.put.mockRejectedValue(new Error('quota'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(valid)))
  const { loadSampledTone } = await import('./playback-tones')
  await expect(loadSampledTone('piano')).resolves.toBeInstanceOf(ArrayBuffer)
  vi.stubGlobal('caches', undefined)
  vi.resetModules()
  const { loadSampledTone: loadWithoutStorage } = await import('./playback-tones')
  await expect(loadWithoutStorage('piano')).resolves.toBeInstanceOf(ArrayBuffer)
})

test('reports received bytes to subscribers throughout a streamed download', async () => {
  setupCache()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, {
    headers: { 'Content-Length': String(valid.byteLength) },
  })))
  const { loadSampledTone, subscribeToneDownloadProgress } = await import('./playback-tones')
  const updates: { loaded: number; total: number | null }[] = []
  const unsubscribe = subscribeToneDownloadProgress(value => updates.push(value))
  const request = loadSampledTone('piano')
  controller.enqueue(valid.slice(0, 12))
  await vi.waitFor(() => expect(updates).toContainEqual({ loaded: 12, total: valid.byteLength }))
  controller.enqueue(valid.slice(12))
  controller.close()
  await request
  expect(updates.at(-1)).toEqual({ loaded: valid.byteLength, total: valid.byteLength })
  unsubscribe()
})
