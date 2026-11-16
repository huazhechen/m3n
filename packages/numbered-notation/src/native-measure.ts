/** Platform-independent text measurement contract used by the native engine. */
export type TextStyle = { fontFamily?: string; fontSize: number; fontWeight?: number; textAlign?: 'left' | 'center' | 'right' }
export type TextMetrics = { w: number; h: number; baseline: number; centerOffset?: number }
export type TextMeasurer = { measureText(text: string, style: TextStyle): TextMetrics }

export class DefaultTextMeasurer implements TextMeasurer {
  measureText(text: string, style: TextStyle): TextMetrics {
    return { w: [...text].reduce((width, character) => width + style.fontSize * (/\s/.test(character) ? 0.3 : character.codePointAt(0)! > 255 ? 1 : 0.6), 0), h: style.fontSize, baseline: style.fontSize * 0.8 }
  }
}

export class CanvasTextMeasurer implements TextMeasurer {
  constructor(private readonly context: CanvasRenderingContext2D) {}
  measureText(text: string, style: TextStyle): TextMetrics {
    this.context.font = `${style.fontWeight ?? 400} ${style.fontSize}px ${style.fontFamily ?? 'serif'}`
    const metrics = this.context.measureText(text)
    return { w: Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight), h: style.fontSize, baseline: style.fontSize * 0.8,
      centerOffset: (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft - metrics.width) / 2 }
  }
}
