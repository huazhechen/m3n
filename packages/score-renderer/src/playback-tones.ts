import pianoUrl from '../vendor/soundfonts/FluidR3_GM-Piano.sf3?url'

export type PlaybackTone = 'synth' | 'piano'
export type SampledTone = Exclude<PlaybackTone, 'synth'>

export const PLAYBACK_TONES = [
  { value: 'synth', label: '合成音色' },
  { value: 'piano', label: '钢琴' },
] as const

export function isPlaybackTone(value: unknown): value is PlaybackTone {
  return PLAYBACK_TONES.some(tone => tone.value === value)
}

const urls = { piano: pianoUrl }
const pending = new Map<SampledTone, Promise<ArrayBuffer>>()
export type ToneDownloadProgress = { loaded: number; total: number | null }
const progressListeners = new Set<(progress: ToneDownloadProgress) => void>()
let downloadProgress: ToneDownloadProgress = { loaded: 0, total: null }

export function subscribeToneDownloadProgress(listener: (progress: ToneDownloadProgress) => void) {
  progressListeners.add(listener)
  listener(downloadProgress)
  return () => { progressListeners.delete(listener) }
}

function reportProgress(loaded: number, total: number | null) {
  downloadProgress = { loaded, total }
  progressListeners.forEach(listener => listener(downloadProgress))
}

const CACHE_NAME = 'm3n-soundfonts-v1'

function validateSoundFont(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'sfbk') {
    throw new Error('音色文件无效，请重试。')
  }
  return data
}

async function download(tone: SampledTone) {
  reportProgress(0, null)
  const url = urls[tone]
  let cache: Cache | undefined
  try {
    cache = await globalThis.caches?.open(CACHE_NAME)
    const cached = await cache?.match(url)
    if (cached) {
      try {
        const data = validateSoundFont(await cached.arrayBuffer())
        reportProgress(data.byteLength, data.byteLength)
        return data
      } catch { await cache?.delete(url) }
    }
  } catch {
    // Private browsing or exhausted storage must not prevent playback.
    cache = undefined
  }
  const failure = '无法下载钢琴音色，请检查网络后重试。'
  let response: Response
  try { response = await fetch(url) } catch { throw new Error(failure) }
  if (!response.ok) throw new Error(failure)
  const length = Number(response.headers.get('Content-Length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  reportProgress(0, total)
  let buffer: ArrayBuffer
  try {
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        reportProgress(loaded, total)
      }
      const bytes = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      buffer = bytes.buffer
    } else buffer = await response.arrayBuffer()
  } catch { throw new Error(failure) }
  const data = validateSoundFont(buffer)
  reportProgress(data.byteLength, data.byteLength)
  try { await cache?.put(url, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } })) } catch {
    // Keep the in-memory copy when persistent caching is unavailable.
  }
  return data
}

/** Downloads only the selected sample bank. Hashed URLs also version the durable cache. */
export async function loadSampledTone(tone: SampledTone): Promise<ArrayBuffer> {
  let request = pending.get(tone)
  if (!request) {
    request = download(tone)
    pending.set(tone, request)
    void request.catch(() => { if (pending.get(tone) === request) pending.delete(tone) })
  }
  // Worklet messages may transfer ownership; never expose the cached buffer itself.
  return (await request).slice(0)
}
