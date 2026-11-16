export const SCORE_WIDTH_KEY = 'm3n:score-width'
export const PLAYBACK_BPM_KEY = 'm3n:playback-bpm'
export const METRONOME_ENABLED_KEY = 'm3n:metronome-enabled'
export const RENDER_MODE_KEY = 'm3n:render-mode'

export const SCORE_WIDTH_MIN = 320
export const SCORE_WIDTH_MAX = 2560
export const SCORE_WIDTH_STEP = 10
export const DEFAULT_SCORE_WIDTH = 800

export const PLAYBACK_BPM_MIN = 10
export const PLAYBACK_BPM_MAX = 240

export function clampPlaybackBpm(value: number) {
  return Math.max(PLAYBACK_BPM_MIN, Math.min(PLAYBACK_BPM_MAX, Math.round(value)))
}

export function readPlaybackBpm(): number | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_BPM_KEY)
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? clampPlaybackBpm(value) : null
  } catch { return null }
}
export const PLAYBACK_TRANSPOSE_MIN = -12
export const PLAYBACK_TRANSPOSE_MAX = 12
export const DEFAULT_PLAYBACK_TRANSPOSE = 0

export type RenderMode = 'paged' | 'continuous'
export const DEFAULT_RENDER_MODE: RenderMode = 'continuous'

export function readRendererSetting(key: string, fallback: number, min?: number, max?: number) {
  let value = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) value = parsed
    }
  } catch {
    // 本地存储不可用时使用默认值。
  }
  if (min !== undefined) value = Math.max(min, value)
  if (max !== undefined) value = Math.min(max, value)
  return value
}

export function writeRendererSetting(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // 本地存储不可用时忽略写入。
  }
}

export function readRenderMode(): RenderMode {
  try {
    const raw = localStorage.getItem(RENDER_MODE_KEY)
    return raw === 'paged' || raw === 'continuous' ? raw : DEFAULT_RENDER_MODE
  } catch {
    return DEFAULT_RENDER_MODE
  }
}

export function writeRenderMode(mode: RenderMode) {
  try {
    localStorage.setItem(RENDER_MODE_KEY, mode)
  } catch {
    // 本地存储不可用时忽略写入。
  }
}
