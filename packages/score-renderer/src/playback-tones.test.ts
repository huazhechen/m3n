import { afterEach, expect, test, vi } from 'vitest'
import type { ToneWorkerResult } from './tone-catalog'

const valid = new TextEncoder().encode('RIFF1234sfbkpayload').buffer
new DataView(valid).setUint32(4, valid.byteLength - 8, true)
const workers: FakeWorker[] = []
class FakeWorker {
  onmessage?: (event: { data: ToneWorkerResult }) => void
  onerror?: (event: { preventDefault: () => void }) => void
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { workers.push(this) }
  send(data: ToneWorkerResult) { this.onmessage?.({ data }) }
}
afterEach(() => { workers.length = 0; vi.unstubAllGlobals(); vi.resetModules() })
function setup() {
  const entries = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()) }),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No sample downloads allowed') }))
  return { entries, cache }
}
test('deduplicates generation, reports progress and returns independent transferable buffers', async () => {
  setup()
  const { loadGeneratedTone, subscribeToneGenerationProgress } = await import('./playback-tones')
  const updates: unknown[] = []
  const unsubscribe = subscribeToneGenerationProgress(value => updates.push(value))
  const first = loadGeneratedTone('piano'), second = loadGeneratedTone('piano')
  await vi.waitFor(() => expect(workers).toHaveLength(1))
  workers[0].send({ type: 'progress', progress: { tone: 'piano', completed: 12, total: 48, stage: 'samples' } })
  workers[0].send({ type: 'ready', data: valid.slice(0) })
  const [a, b] = await Promise.all([first, second])
  expect(a).not.toBe(b); expect(new Uint8Array(a)).toEqual(new Uint8Array(b))
  structuredClone(a, { transfer: [a] })
  expect((await loadGeneratedTone('piano')).byteLength).toBe(valid.byteLength)
  expect(updates).toContainEqual({ tone: 'piano', completed: 12, total: 48, stage: 'samples' })
  expect(workers[0].terminate).toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  unsubscribe()
})
test('reads the persistent generated bank after a module reload without a worker', async () => {
  setup()
  const module = await import('./playback-tones')
  const request = module.loadGeneratedTone('flute')
  await vi.waitFor(() => expect(workers).toHaveLength(1))
  workers[0].send({ type: 'ready', data: valid.slice(0) }); await request
  vi.resetModules()
  const restored = await (await import('./playback-tones')).loadGeneratedTone('flute')
  expect(new Uint8Array(restored)).toEqual(new Uint8Array(valid))
  expect(workers).toHaveLength(1)
})
test('rebuilds a corrupt cache and retries worker failures', async () => {
  const { entries, cache } = setup()
  const module = await import('./playback-tones')
  const key = new URL(`./${module.GENERATED_TONE_CACHE}/guitar.sf2`, import.meta.url).href
  entries.set(key, new Response('broken'))
  const first = module.loadGeneratedTone('guitar')
  const failed = expect(first).rejects.toThrow('failed')
  await vi.waitFor(() => expect(workers).toHaveLength(1))
  workers[0].send({ type: 'error', message: 'failed' }); await failed
  expect(cache.delete).toHaveBeenCalledWith(key)
  const retry = module.loadGeneratedTone('guitar')
  await vi.waitFor(() => expect(workers).toHaveLength(2))
  workers[1].send({ type: 'ready', data: valid.slice(0) }); await retry
})
test('cancels a worker and allows a fresh generation without caching partial data', async () => {
  const { cache } = setup()
  const module = await import('./playback-tones')
  const request = module.loadGeneratedTone('violin')
  const cancelled = expect(request).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(workers).toHaveLength(1))
  module.cancelToneGeneration('violin'); await cancelled
  expect(workers[0].terminate).toHaveBeenCalled()
  expect(cache.put).not.toHaveBeenCalled()
  const retry = module.loadGeneratedTone('violin')
  await vi.waitFor(() => expect(workers).toHaveLength(2))
  workers[1].send({ type: 'ready', data: valid.slice(0) }); await retry
})
test('storage restrictions do not prevent generation or memory reuse', async () => {
  setup(); vi.stubGlobal('caches', { open: async () => { throw new Error('private mode') } })
  const module = await import('./playback-tones')
  const request = module.loadGeneratedTone('harmonica')
  await vi.waitFor(() => expect(workers).toHaveLength(1))
  workers[0].send({ type: 'ready', data: valid.slice(0) }); await request
  await module.loadGeneratedTone('harmonica')
  expect(workers).toHaveLength(1)
})
