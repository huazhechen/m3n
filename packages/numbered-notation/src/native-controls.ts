import { scoreNavigationGlyphHeight } from './layout/policy.js'
import { SCORE_TEXT_FONT } from './font-family.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import { nativeMeterGeometry } from './native-meter.js'
import { nativeStyle } from './native-style.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk, nativeSvgPieces, translateNativeInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeKeyGeometry, type NativeKeyRow } from './native-key.js'
import type { NativeControl } from './native-model.js'
import { nativeTempoGeometry } from './native-tempo.js'
import { nativeNavigationGlyph } from './native-navigation-glyphs.js'
import { nativeMusicAxis } from './native-axis.js'

export function measureNativeTempo(tempo: { unit: number; bpm: number }, measurer: TextMeasurer): NativeControl {
  return measureNativeControl('tempo', `${Number(tempo.bpm.toFixed(2))} BPM`, measurer, undefined, tempo.unit)
}

export function measureNativeControl(kind: NativeControl['kind'], text: string, measurer: TextMeasurer, keyRows?: NativeKeyRow[], tempoUnit?: number): NativeControl {
  const painter = new NativeSymbols(measurer)
  const textWidth = (value: string, size: number, family: string) => measurer.measureText(value, { fontSize: size, fontFamily: family }).w
  // Navigation/signature labels are semantic identifiers, not painted text.
  // Measure only the actual primitives used by their drawing geometry.
  const m = kind === 'section' ? measurer.measureText(text, { fontSize: nativeStyle.annotation, fontFamily: SCORE_TEXT_FONT, fontWeight: scoreLayoutConfig.fonts.boldWeight }) : undefined
  let width = m?.w ?? 0, anchor = 0
  if (kind === 'key') { const geometry = nativeKeyGeometry(keyRows ?? [{key:text}],measurer); width = geometry.width; anchor = geometry.anchor }
  if (kind === 'segno') { width = nativeNavigationGlyph('segno', scoreNavigationGlyphHeight(), measurer).width; anchor = width / 2 }
  if (kind === 'coda') { width = nativeNavigationGlyph('coda', scoreNavigationGlyphHeight(), measurer).width + nativeStyle.text * .3 + textWidth('Coda', nativeStyle.text, SCORE_TEXT_FONT); anchor = width / 2 }
  const meterGeometry = kind === 'meter' ? nativeMeterGeometry(text, measurer) : undefined
  if (meterGeometry) { width = meterGeometry.width; anchor = width / 2 }
  const tempoGeometry = kind === 'tempo' ? nativeTempoGeometry(text, measurer, tempoUnit) : undefined
  if (tempoGeometry) { width = tempoGeometry.width; anchor = tempoGeometry.anchor }
  const sectionLeft = Math.min(0, m?.inkLeft ?? 0)
  if (m) { width = Math.max(m.w, m.inkRight ?? m.w) - sectionLeft + nativeStyle.annotation * 0.5; anchor = nativeStyle.annotation * 0.25 - sectionLeft + measurer.measureText([...text][0]!, { fontSize: nativeStyle.annotation, fontFamily: SCORE_TEXT_FONT, fontWeight: scoreLayoutConfig.fonts.boldWeight }).w / 2 }
  const sectionAxis = kind === 'section' ? nativeMusicAxis(measurer) : 0
  const item: NativeControl = { kind, text, keyRows, meterGeometry, tempoGeometry, width, anchor, ink: [], top: m ? -sectionAxis + m.h / 2 + nativeStyle.annotation * 0.25 : 0, bottom: m ? sectionAxis + m.h / 2 + nativeStyle.annotation * 0.25 : 0 }
  if (kind === 'section') item.textInset = nativeStyle.annotation * 0.25 - sectionLeft
  const ink = nativeSvgInk(painter.control(item), measurer)
  item.top = -ink.top; item.bottom = ink.bottom
  item.width = Math.max(width, ink.right) - Math.min(0, ink.left)
  item.ink = nativeSvgPieces(painter.control(item), measurer)
  return item
}

/** Final control primitives, in system/lane coordinates after horizontal placement. */
export function placedNativeControlInk(control: NativeControl) {
  return control.x === undefined ? [] : control.ink.map(ink => translateNativeInk(ink, control.x!, 0))
}
