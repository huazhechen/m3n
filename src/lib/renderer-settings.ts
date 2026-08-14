export const SCORE_WIDTH_KEY = 'm3n:score-width'
export const PLAYBACK_SPEED_KEY = 'm3n:playback-speed'
export const RENDER_MODE_KEY = 'm3n:render-mode'

export const SCORE_WIDTH_MIN = 320
export const SCORE_WIDTH_MAX = 2560
export const SCORE_WIDTH_STEP = 10
export const DEFAULT_SCORE_WIDTH = 800

export const PLAYBACK_SPEED_MIN = 50
export const PLAYBACK_SPEED_MAX = 200
export const PLAYBACK_SPEED_STEP = 5
export const DEFAULT_PLAYBACK_SPEED = 100

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
