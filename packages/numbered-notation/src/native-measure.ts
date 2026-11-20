import { SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
/** Platform-independent text measurement contract used by the native engine. */
export type TextStyle = { fontFamily?: string; fontSize: number; fontWeight?: number; fontStyle?: 'normal' | 'italic'; textAlign?: 'left' | 'center' | 'right' }
export type TextMetrics = { w: number; h: number; baseline: number; inkBottom?: number; centerOffset?: number; advance?: number; inkLeft?: number; inkRight?: number }
export type TextMeasurer = { measureText(text: string, style: TextStyle): TextMetrics }

/** Approximate offline fallback. Browser engraving uses CanvasTextMeasurer;
 * headless consumers should inject measured metrics for their actual fonts. */
export class DefaultTextMeasurer implements TextMeasurer {
  measureText(text: string, style: TextStyle): TextMetrics {
    return { w: [...text].reduce((width, character) => width + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : 0.58), 0), h: style.fontSize, baseline: style.fontSize * 0.8, inkBottom: style.fontSize * 0.8 }
  }
}

export class CanvasTextMeasurer implements TextMeasurer {
  constructor(private readonly context: CanvasRenderingContext2D) {}
  measureText(text: string, style: TextStyle): TextMetrics {
    this.context.textAlign = 'left'; this.context.textBaseline = 'alphabetic'
    const family = style.fontFamily ?? SCORE_TEXT_FONT
    const weight = style.fontWeight ?? (family === SCORE_TEXT_FONT ? SCORE_TEXT_WEIGHT : 400)
    this.context.font = `${style.fontStyle ?? 'normal'} ${weight} ${style.fontSize}px ${family}`
    const metrics = this.context.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent
    return { w: Math.max(metrics.width, style.fontSize * 0.25),
      h: ascent + descent, baseline: ascent, advance: metrics.width, inkLeft: -metrics.actualBoundingBoxLeft, inkRight: metrics.actualBoundingBoxRight,
      centerOffset: (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft - metrics.width) / 2 }
  }
}
