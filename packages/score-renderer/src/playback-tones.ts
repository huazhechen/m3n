import pianoUrl from '../vendor/soundfonts/FluidR3_GM-Piano.sf3?url'
import harmonicaUrl from '../vendor/soundfonts/FluidR3_GM-Harmonica.sf3?url'

export type PlaybackTone = 'synth' | 'piano' | 'harmonica'
export type SampledTone = Exclude<PlaybackTone, 'synth'>

export const PLAYBACK_TONES = [
  { value: 'synth', label: '合成音色' },
  { value: 'piano', label: '钢琴' },
  { value: 'harmonica', label: '口琴' },
] as const

export function isPlaybackTone(value: unknown): value is PlaybackTone {
  return PLAYBACK_TONES.some(tone => tone.value === value)
}

const urls = { piano: pianoUrl, harmonica: harmonicaUrl }
const pending = new Map<SampledTone, Promise<ArrayBuffer>>()
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
  const url = urls[tone]
  let cache: Cache | undefined
  try {
    cache = await globalThis.caches?.open(CACHE_NAME)
    const cached = await cache?.match(url)
    if (cached) {
      try { return validateSoundFont(await cached.arrayBuffer()) } catch { await cache?.delete(url) }
    }
  } catch {
    // Private browsing or exhausted storage must not prevent playback.
    cache = undefined
  }
  const failure = `无法下载${tone === 'piano' ? '钢琴' : '口琴'}音色，请检查网络后重试。`
  let response: Response
  try { response = await fetch(url) } catch { throw new Error(failure) }
  if (!response.ok) throw new Error(failure)
  const data = validateSoundFont(await response.arrayBuffer())
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
