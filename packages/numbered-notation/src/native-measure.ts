import { SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
/** Platform-independent text measurement contract used by the native engine. */
export type TextStyle = { fontFamily?: string; fontSize: number; fontWeight?: number; fontStyle?: 'normal' | 'italic'; textAlign?: 'left' | 'center' | 'right' }
export type TextMetrics = { w: number; h: number; baseline: number; inkBottom?: number; centerOffset?: number; advance?: number; inkLeft?: number; inkRight?: number }
export type TextMeasurer = { measureText(text: string, style: TextStyle): TextMetrics }

/** Owned by one render/export task, never shared by independent tasks. */
export class NumberedTextMeasurementCache {
  private readonly fonts = new Map<string, Map<string, TextMetrics>>()
  private faces: { face: FontFace; status: string }[] = []
  read(font: string, text: string) { const metrics = this.fonts.get(font)?.get(text); return metrics && { ...metrics } }
  write(font: string, text: string, metrics: TextMetrics) {
    let texts = this.fonts.get(font)
    if (!texts) { texts = new Map(); this.fonts.set(font, texts) }
    texts.set(text, { ...metrics })
  }
  /** Check once per layout, including changes made by another concurrent task. */
  synchronizeFonts() {
    const faces = typeof document === 'undefined' || !document.fonts ? [] : Array.from(document.fonts)
    if (faces.length === this.faces.length && faces.every((face, i) => face === this.faces[i]!.face && face.status === this.faces[i]!.status)) return false
    this.fonts.clear()
    this.faces = faces.map(face => ({ face, status: face.status }))
    return true
  }
}

/** Approximate offline fallback. Browser engraving uses CanvasTextMeasurer;
 * headless consumers should inject measured metrics for their actual fonts. */
export class DefaultTextMeasurer implements TextMeasurer {
  measureText(text: string, style: TextStyle): TextMetrics {
    return { w: [...text].reduce((width, character) => width + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : 0.58), 0), h: style.fontSize, baseline: style.fontSize * 0.8, inkBottom: style.fontSize * 0.8 }
  }
}

export class CanvasTextMeasurer implements TextMeasurer {
  private requestedFont?: string
  private appliedFont?: string
  constructor(private readonly context: CanvasRenderingContext2D, private readonly timings?: Record<string, number>, private readonly cache?: NumberedTextMeasurementCache) {}
  measureText(text: string, style: TextStyle): TextMetrics {
    if (this.timings) this.timings.textMeasureRequests = (this.timings.textMeasureRequests ?? 0) + 1
    const family = style.fontFamily ?? SCORE_TEXT_FONT
    const weight = style.fontWeight ?? (family === SCORE_TEXT_FONT ? SCORE_TEXT_WEIGHT : 400)
    const font = `${style.fontStyle ?? 'normal'} ${weight} ${style.fontSize}px ${family}`
    const saved = this.cache?.read(font, text)
    if (saved) {
      if (this.timings) this.timings.textMeasureCacheHits = (this.timings.textMeasureCacheHits ?? 0) + 1
      return saved
    }
    if (this.timings) this.timings.textMeasureCalls = (this.timings.textMeasureCalls ?? 0) + 1
    if (this.context.textAlign !== 'left') this.context.textAlign = 'left'
    if (this.context.textBaseline !== 'alphabetic') this.context.textBaseline = 'alphabetic'
    // Canvas normalizes the font string. Avoid reparsing an unchanged font,
    // but detect external context edits. Task owners synchronize the font set
    // before each layout, so later font installations invalidate old metrics.
    if (font !== this.requestedFont || this.context.font !== this.appliedFont) {
      this.context.font = font
      this.requestedFont = font
      this.appliedFont = this.context.font
    }
    const metrics = this.context.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent
    const result = { w: Math.max(metrics.width, style.fontSize * 0.25),
      h: ascent + descent, baseline: ascent, advance: metrics.width, inkLeft: -metrics.actualBoundingBoxLeft, inkRight: metrics.actualBoundingBoxRight,
      centerOffset: (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft - metrics.width) / 2 }
    this.cache?.write(font, text, result)
    return result
  }
}
