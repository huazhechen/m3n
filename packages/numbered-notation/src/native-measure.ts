import { defaultBravuraCharacterMetrics } from './bravura-characters.js'
import { SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
/** Platform-independent text measurement contract used by the native engine. */
export type TextStyle = { fontFamily?: string; fontSize: number; fontWeight?: number; fontStyle?: 'normal' | 'italic'; textAlign?: 'left' | 'center' | 'right' }
export type TextMetrics = { w: number; h: number; baseline: number; inkBottom?: number; centerOffset?: number; advance?: number; inkLeft?: number; inkRight?: number }
export type TextMeasurer = { measureText(text: string, style: TextStyle): TextMetrics; fixedSymbol?<T extends object>(key: string, create: () => T): T }

/** Owned by one render/export task, never shared by independent tasks. */
export class NumberedTextMeasurementCache {
  private readonly fonts = new Map<string, Map<string, TextMetrics>>()
  private fontRevision = 0
  get revision() { return this.fontRevision }
  /** Internal read-only bucket; replaced when the task font set changes. */
  readFont(font: string): ReadonlyMap<string, TextMetrics> {
    let texts = this.fonts.get(font)
    if (!texts) { texts = new Map(); this.fonts.set(font, texts) }
    return texts
  }
  private readonly symbols = new Map<string, object>()
  readSymbol<T extends object>(key: string) { return this.symbols.get(key) as T | undefined }
  writeSymbol(key: string, value: object) { this.symbols.set(key,value) }
  private faces: { face: FontFace; status: string }[] = []
  read(font: string, text: string) { const metrics = this.fonts.get(font)?.get(text); return metrics && { ...metrics } }
  write(font: string, text: string, metrics: TextMetrics) {
    let texts = this.fonts.get(font)
    if (!texts) { texts = new Map(); this.fonts.set(font, texts) }
    const saved = Object.freeze({ ...metrics })
    texts.set(text, saved)
    return saved
  }
  /** Check once per layout, including changes made by another concurrent task. */
  synchronizeFonts() {
    const faces = typeof document === 'undefined' || !document.fonts ? [] : Array.from(document.fonts)
    if (faces.length === this.faces.length && faces.every((face, i) => face === this.faces[i]!.face && face.status === this.faces[i]!.status)) return false
    this.fontRevision++
    this.fonts.clear()
    this.symbols.clear()
    this.faces = faces.map(face => ({ face, status: face.status }))
    return true
  }
}

/** Approximate offline fallback. Browser engraving uses CanvasTextMeasurer;
 * headless consumers should inject measured metrics for their actual fonts. */
export class DefaultTextMeasurer implements TextMeasurer {
  measureText(text: string, style: TextStyle): TextMetrics {
    const music = style.fontFamily === 'Bravura' ? defaultBravuraCharacterMetrics(text, style.fontSize) : undefined
    if (music) return music
    return { w: [...text].reduce((width, character) => width + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : 0.58), 0), h: style.fontSize, baseline: style.fontSize * 0.8, inkBottom: style.fontSize * 0.8 }
  }
}

export class CanvasTextMeasurer implements TextMeasurer {
  private lastStyle?: { family: string; weight: number; size: number; italic: string; font: string }
  private fontTexts?: ReadonlyMap<string, TextMetrics>
  private fontRevision = -1
  private requestedFont?: string
  private appliedFont?: string
  constructor(private readonly context: CanvasRenderingContext2D, private readonly timings?: Record<string, number>, private readonly cache?: NumberedTextMeasurementCache, private readonly shareMetrics = false) {}
  fixedSymbol<T extends object>(key: string, create: () => T): T {
    if (this.timings) this.timings.fixedSymbolRequests = (this.timings.fixedSymbolRequests ?? 0) + 1
    const saved = this.cache?.readSymbol<T>(key)
    if (saved) {
      if (this.timings) this.timings.fixedSymbolCacheHits = (this.timings.fixedSymbolCacheHits ?? 0) + 1
      return saved
    }
    if (this.timings) this.timings.fixedSymbolBuilds = (this.timings.fixedSymbolBuilds ?? 0) + 1
    const result = create()
    this.cache?.writeSymbol(key,result)
    return result
  }
  measureText(text: string, style: TextStyle): TextMetrics {
    const metrics = this.measureShared(text, style)
    return this.shareMetrics ? metrics : { ...metrics }
  }
  private measureShared(text: string, style: TextStyle): TextMetrics {
    if (this.timings) this.timings.textMeasureRequests = (this.timings.textMeasureRequests ?? 0) + 1
    const family = style.fontFamily ?? SCORE_TEXT_FONT
    const weight = style.fontWeight ?? (family === SCORE_TEXT_FONT ? SCORE_TEXT_WEIGHT : 400)
    const italic = style.fontStyle ?? 'normal'
    let current = this.lastStyle
    if (!current || current.family !== family || current.weight !== weight || current.size !== style.fontSize || current.italic !== italic) {
      current = this.lastStyle = { family, weight, size: style.fontSize, italic, font: `${italic} ${weight} ${style.fontSize}px ${family}` }
      this.fontTexts = this.cache?.readFont(current.font)
      this.fontRevision = this.cache?.revision ?? -1
      if (this.timings) this.timings.textMeasureFontKeyBuilds = (this.timings.textMeasureFontKeyBuilds ?? 0) + 1
    } else if (this.cache && this.fontRevision !== this.cache.revision) {
      this.fontTexts = this.cache.readFont(current.font)
      this.fontRevision = this.cache.revision
    }
    const font = current.font
    const saved = this.fontTexts?.get(text)
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
    return this.cache?.write(font, text, result) ?? Object.freeze(result)
  }
}
