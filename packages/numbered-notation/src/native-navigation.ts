import { nativeMusicAxis } from './native-axis.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'
import { SCORE_TEXT_FONT } from './font-family.js'

export type NativeNavigation = {
  text: string; size: number; width: number; svg: string; ink: NativeInk; x?: number
}

/** One measured fragment supplies both the reserved space and the painted mark. */
export function measureNativeNavigation(name: 'fine' | 'dc' | 'ds' | 'tocoda', measurer: TextMeasurer): NativeNavigation {
  const text = name === 'tocoda' ? 'To Coda' : name === 'fine' ? 'Fine.' : name === 'dc' ? 'D.C.' : 'D.S.'
  const size = nativeStyle.text * (name === 'fine' ? 1.05 : 1)
  const family = SCORE_TEXT_FONT, painter = new NativeSymbols(measurer)
  const metrics = measurer.measureText(text, { fontSize: size, fontFamily: family, fontWeight: 500 })
  const raw = nativeSvgInk(painter.text(text, 0, 0, size, family, { 'font-weight': 500 }), measurer)
  const axis = nativeMusicAxis(measurer)
  const left = Math.min(0, raw.left), baseline = axis - (raw.top + raw.bottom) / 2
  const svg = painter.text(text, -left, baseline, size, family, { 'data-m3n-role': 'navigation', 'font-weight': 500 })
  return { text, size, width: Math.max(metrics.advance ?? metrics.w, raw.right) - left, svg, ink: nativeSvgInk(svg, measurer) }
}
