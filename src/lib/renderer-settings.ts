import { DEFAULT_PREFERRED_WIDTH } from '@m3n/notation'

export const SCORE_WIDTH_KEY = 'm3n:score-width'
export const PLAYBACK_BPM_KEY = 'm3n:playback-bpm'
export const METRONOME_ENABLED_KEY = 'm3n:metronome-enabled'
export const RENDER_MODE_KEY = 'm3n:render-mode'

export const SCORE_WIDTH_MIN = 320
export const SCORE_WIDTH_MAX = 1280
export const SCORE_WIDTH_STEP = 10
export const DEFAULT_SCORE_WIDTH = DEFAULT_PREFERRED_WIDTH

export function clampScoreWidth(width: number) {
  return Math.max(SCORE_WIDTH_MIN, Math.min(SCORE_WIDTH_MAX, width))
}

export function stepScoreWidth(width: number, direction: -1 | 1) {
  const step = direction === 1 ? Math.floor(width / SCORE_WIDTH_STEP) + 1 : Math.ceil(width / SCORE_WIDTH_STEP) - 1
  return clampScoreWidth(step * SCORE_WIDTH_STEP)
}

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
export const DEFAULT_RENDER_MODE: RenderMode = 'paged'

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

export type NotationMode = 'movable' | 'fixed' | 'staff'
export const NOTATION_MODES = [
  { value: 'movable', label: '首调' },
  { value: 'fixed', label: '固定调' },
  { value: 'staff', label: '五线谱' },
] as const
export function readNotationMode(): NotationMode {
  try {
    const mode = localStorage.getItem('m3n:notation-mode')
    if (mode === 'movable' || mode === 'fixed' || mode === 'staff') return mode
    return localStorage.getItem('m3n:fixed-do') === '1' ? 'fixed' : 'movable'
  } catch { return 'movable' }
}
export function writeNotationMode(mode: NotationMode) {
  try { localStorage.setItem('m3n:notation-mode', mode) } catch { /* Storage is optional. */ }
}
