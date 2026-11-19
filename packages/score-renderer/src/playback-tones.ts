import type { GeneratedTone, ToneGenerationProgress, ToneWorkerResult } from './tone-catalog.js'
export { PLAYBACK_TONES, isPlaybackTone, type PlaybackTone, type GeneratedTone, type ToneGenerationProgress } from './tone-catalog.js'
const listeners = new Set<(progress: ToneGenerationProgress) => void>()
const progress = new Map<GeneratedTone, ToneGenerationProgress>()
const pending = new Map<GeneratedTone, Promise<ArrayBuffer>>()
const cancellations = new Map<GeneratedTone, () => void>()
// Bump this revision whenever synthesis or SF2 layout changes.
export const GENERATED_TONE_CACHE = 'm3n-generated-tones-v2'
export function subscribeToneGenerationProgress(listener: (value: ToneGenerationProgress) => void) {
  listeners.add(listener)
  progress.forEach(listener)
  return () => { listeners.delete(listener) }
}
function report(value: ToneGenerationProgress) {
  progress.set(value.tone, value)
  listeners.forEach(listener => listener(value))
}
function validate(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'sfbk' || new DataView(data).getUint32(4, true) !== data.byteLength - 8) {
    throw new Error('生成的音色数据无效，请重试。')
  }
  return data
}
async function generate(tone: GeneratedTone) {
  report({ tone, completed: 0, total: 1, stage: 'samples' })
  let worker: Worker | undefined
  let aborted = false
  let rejectWorker: ((error: Error) => void) | undefined
  const abort = () => {
    aborted = true
    worker?.terminate()
    rejectWorker?.(new DOMException('已取消音色生成。', 'AbortError'))
  }
  cancellations.set(tone, abort)
  const check = () => { if (aborted) throw new DOMException('已取消音色生成。', 'AbortError') }
  try {
    let cache: Cache | undefined
    // Construct a cache-only URL at runtime: Vite treats template new URL()
    // expressions as asset globs, but these SF2 files do not exist on disk.
    const directory = import.meta.url.slice(0, import.meta.url.lastIndexOf('/') + 1)
    const key = `${directory}${GENERATED_TONE_CACHE}/${tone}.sf2`
    try {
      cache = await globalThis.caches?.open(GENERATED_TONE_CACHE)
      const cached = await cache?.match(key)
      if (cached) {
        try {
          const data = validate(await cached.arrayBuffer())
          check()
          report({ tone, completed: 1, total: 1, stage: 'ready' })
          return data
        } catch { check(); await cache?.delete(key) }
      }
    } catch { check(); cache = undefined }
    check()
    const data = validate(await new Promise<ArrayBuffer>((resolve, reject) => {
      rejectWorker = reject
      worker = new Worker(new URL('./tone-generation.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data: message }: MessageEvent<ToneWorkerResult>) => {
        if (aborted) return
        if (message.type === 'progress') report(message.progress)
        else if (message.type === 'ready') resolve(message.data)
        else reject(new Error(message.message))
      }
      worker.onerror = event => { event.preventDefault(); reject(new Error('无法生成音色，请重试。')) }
      worker.onmessageerror = () => reject(new Error('无法读取生成的音色，请重试。'))
      worker.postMessage(tone)
    }))
    check()
    try { await cache?.put(key, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } })) } catch { /* quota/private mode */ }
    check()
    report({ tone, completed: 1, total: 1, stage: 'ready' })
    return data
  } finally {
    worker?.terminate()
    if (cancellations.get(tone) === abort) cancellations.delete(tone)
  }
}
export function cancelToneGeneration(tone: GeneratedTone) {
  cancellations.get(tone)?.()
  pending.delete(tone)
  progress.delete(tone)
}
/** Generate only the selected instrument; never transfer the cached buffer itself. */
export async function loadGeneratedTone(tone: GeneratedTone): Promise<ArrayBuffer> {
  let request = pending.get(tone)
  if (!request) {
    request = generate(tone)
    pending.set(tone, request)
    void request.catch(() => { if (pending.get(tone) === request) pending.delete(tone) })
  }
  return (await request).slice(0)
}
