import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeKeyGeometry, type NativeKeyRow } from './native-key.js'
import type { NativeControl } from './native-model.js'

export function measureNativeControl(kind: NativeControl['kind'], text: string, measurer: TextMeasurer, keyRows?: NativeKeyRow[]): NativeControl {
  const painter = new NativeSymbols(measurer)
  const textWidth = (value: string, size: number, family: string) => measurer.measureText(value, { fontSize: size, fontFamily: family }).w
  const size = kind === 'passes' ? nativeStyle.small : kind === 'section' ? nativeStyle.annotation : nativeStyle.text
  const family = kind === 'section' || kind === 'passes' ? 'serif' : 'M3N Numbers'
  const m = measurer.measureText(text, { fontSize: size, fontFamily: family, fontWeight: kind === 'section' ? 700 : 400 })
  let width = m.w, anchor = textWidth(text[0]!, size, family) / 2
  if (kind === 'key') { const geometry = nativeKeyGeometry(keyRows ?? [{key:text}],measurer); width = geometry.width; anchor = geometry.anchor }
  if (kind === 'segno') { width = nativeStyle.annotation; anchor = width / 2 }
  if (kind === 'meter') { width = Math.max(...text.split('/').map(value => textWidth(value, nativeStyle.meter, 'M3N Numbers'))) + nativeStyle.meter * 0.16; anchor = width / 2 }
  if (kind === 'tempo') { width = em(20) + textWidth(text.replace(/^[♪♩]\s*/, ''), nativeStyle.text, 'M3N Numbers'); anchor = em(7) }
  if (kind === 'section') { width += nativeStyle.annotation * 0.5; anchor = nativeStyle.annotation * 0.25 + measurer.measureText(text[0]!, { fontSize: nativeStyle.annotation, fontFamily: 'serif', fontWeight: 700 }).w / 2 }
  const item: NativeControl = { kind, text, keyRows, width, anchor, top: kind === 'section' ? m.baseline + em(2.4) + nativeStyle.annotation * 0.25 : 0, bottom: kind === 'section' ? m.h - m.baseline - em(2.4) + nativeStyle.annotation * 0.25 : 0 }
  const ink = nativeSvgInk(painter.control(item), measurer)
  item.top = -ink.top; item.bottom = ink.bottom
  item.width = Math.max(width, ink.right) - Math.min(0, ink.left)
  return item
}
