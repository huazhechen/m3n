import type { TextMeasurer } from './native-measure.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeStyle } from './native-style.js'
import { bravuraGlyph } from './bravura.js'
export type NativeTempoGeometry = { unit: number; text: string; width: number; anchor: number; path: string; textX: number; baseline: number }
export function nativeTempoGeometry(text: string, measurer: TextMeasurer, unit = text.startsWith('♪') ? 8 : 4): NativeTempoGeometry {
  const size = nativeStyle.text, value = text.replace(/^[♪♩]\s*/, '')
  const metrics = measurer.measureText(value, { fontSize: size, fontFamily: 'M3N Numbers' })
  const baseline = nativeMusicAxis(measurer) + metrics.baseline - (metrics.inkBottom ?? metrics.h) / 2
  const glyph = bravuraGlyph(unit === 1 ? 'metNoteWhole' : unit === 2 ? 'metNoteHalfUp' : unit === 64 ? 'metNote64thUp' : unit === 32 ? 'metNote32ndUp' : unit === 16 ? 'metNote16thUp' : unit === 8 ? 'metNote8thUp' : 'metNoteQuarterUp', size * (unit === 1 ? .33 : 1))
  let coordinate = 0
  const path = glyph.path.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
    if (/^[MLCZ]$/.test(token)) { coordinate = 0; return token }
    return String(Number((Number(token) + (coordinate++ % 2 ? baseline - glyph.height : 0)).toFixed(6)))
  })
  const textX = glyph.width + size * .26
  return { unit, text: value, path, textX, baseline, width: textX + metrics.w, anchor: glyph.width / 2 }
}
