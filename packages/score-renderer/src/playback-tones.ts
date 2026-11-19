import type { InstrumentTone, ToneLoadProgress } from './tone-catalog.js'
import { SAMPLED_TONE_URLS } from './sampled-tone-assets.js'
export { PLAYBACK_TONES, isPlaybackTone, type PlaybackTone, type InstrumentTone, type ToneLoadProgress } from './tone-catalog.js'
const listeners = new Set<(progress: ToneLoadProgress) => void>()
const progress = new Map<InstrumentTone, ToneLoadProgress>()
const pending = new Map<InstrumentTone, Promise<ArrayBuffer>>()
const cancellations = new Map<InstrumentTone, AbortController>()
export const SAMPLED_TONE_CACHE = 'm3n-fluidr3-q3-v1'
export function subscribeToneLoadProgress(listener: (value: ToneLoadProgress) => void) {
  listeners.add(listener)
  progress.forEach(listener)
  return () => { listeners.delete(listener) }
}
function report(value: ToneLoadProgress) {
  progress.set(value.tone, value)
  listeners.forEach(listener => listener(value))
}
function validate(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'sfbk' || new DataView(data).getUint32(4, true) !== data.byteLength - 8) {
    throw new Error('音色数据无效，请重试加载。')
  }
  return data
}
async function download(tone: InstrumentTone) {
  const controller = new AbortController()
  cancellations.set(tone, controller)
  const check = () => controller.signal.throwIfAborted()
  const ready = () => report({ tone, completed: 1, total: 1, stage: 'ready' })
  const key = new URL(SAMPLED_TONE_URLS[tone], import.meta.url).href
  try {
    let cache: Cache | undefined
    try {
      cache = await globalThis.caches?.open(SAMPLED_TONE_CACHE)
      const cached = await cache?.match(key)
      if (cached) {
        try {
          const data = validate(await cached.arrayBuffer())
          check(); ready()
          return data
        } catch { check(); await cache?.delete(key) }
      }
    } catch { check(); cache = undefined }
    check()
    report({ tone, completed: 0, total: 0, stage: 'download' })
    const response = await fetch(key, { signal: controller.signal })
    if (!response.ok) throw new Error(`无法加载音色（${response.status}），请重试。`)
    const total = Math.max(0, Number(response.headers.get('Content-Length')) || 0)
    let data: ArrayBuffer
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let completed = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          check()
          if (done) break
          chunks.push(value); completed += value.length
          report({ tone, completed, total, stage: 'download' })
        }
      } finally { reader.releaseLock() }
      const audio = new Uint8Array(completed)
      let offset = 0
      for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length }
      data = audio.buffer
    } else data = await response.arrayBuffer()
    check(); validate(data)
    try { await cache?.put(key, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } })) } catch { /* quota/private mode */ }
    check(); ready()
    return data
  } catch (error) {
    check()
    if (error instanceof TypeError) throw new Error('无法加载音色，请检查网络后重试。', { cause: error })
    throw error
  } finally {
    if (cancellations.get(tone) === controller) cancellations.delete(tone)
  }
}
export function cancelToneLoad(tone: InstrumentTone) {
  cancellations.get(tone)?.abort()
  pending.delete(tone)
  progress.delete(tone)
}
/** Load only the selected instrument; never transfer the cached buffer itself. */
export async function loadSampledTone(tone: InstrumentTone): Promise<ArrayBuffer> {
  let request = pending.get(tone)
  if (!request) {
    request = download(tone)
    pending.set(tone, request)
    void request.catch(() => { if (pending.get(tone) === request) pending.delete(tone) })
  }
  return (await request).slice(0)
}
