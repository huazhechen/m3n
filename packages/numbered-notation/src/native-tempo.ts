import { nativeSvgNumber as n } from './native-svg-number.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeStyle } from './native-style.js'

export type NativeTempoGeometry = {
  unit: number; text: string; width: number; anchor: number
  path: string; textX: number; baseline: number
}

/** Project metronome outline, authored on an 11-unit grid. The head sits on
 * the text baseline; only the measured text center aligns to the music axis.
 * Keep this native implementation independent of the reference renderer. */
export function nativeTempoGeometry(text: string, measurer: TextMeasurer, unit = text.startsWith('♪') ? 8 : 4): NativeTempoGeometry {
  const size = nativeStyle.text, scale = size / 11
  const value = text.replace(/^[♪♩]\s*/, '')
  const metrics = measurer.measureText(value, { fontSize: size, fontFamily: 'M3N Numbers' })
  const baseline = nativeMusicAxis(measurer) + metrics.baseline - (metrics.inkBottom ?? metrics.h) / 2
  const flags = Math.max(0, Math.log2(unit / 4))
  const textX = (unit === 1 ? 6 : 3.864 + (flags ? 4 : 0)) * scale + size * .26
  let outline = 'M3.864 8.5 Q3.864 9.228 3.5 9.76 Q3.136 10.292 2.555 10.586 Q1.974 10.88 1.302 10.88 Q.826 10.88 .413 10.621 Q0 10.362 0 9.844 Q0 9.34 .364 8.899 Q.728 8.458 1.288 8.185 Q1.848 7.912 2.422 7.912 Q2.968 7.912 3.304 8.094 L3.304 0 L3.864 0 Z'
  if (unit === 2) outline += ' M.65 9.75 Q.7 10.35 1.35 10.2 Q2.1 10.05 2.75 9.25 Q3.45 8.4 2.8 8.5 Q1.95 8.45 1.1 9.15 Q.65 9.5 .65 9.75 Z'
  if (unit === 1) outline = 'M6 1.8 C6 4.2 0 4.2 0 1.8 C0 -.6 6 -.6 6 1.8 Z M4.7 2.2 C4.3 .1 1.1 -.1 1.3 1.4 C1.7 3.5 4.9 3.7 4.7 2.2 Z'
  for (let flag = 0; flag < flags; flag++) {
    const y = flag * 2.2
    outline += ` M3.864 ${y} Q8.864 ${y + 2} 5.864 ${y + 6} Q6.864 ${y + 3} 3.864 ${y + 2} Z`
  }
  // Bake the transform into the path so the same exact curve extrema are used
  // by the ink measurer and painter (no stroke inflation or sampled ellipse).
  let coordinate = 0
  const path = outline.replace(/[MLQCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
    if (/^[MLQCZ]$/.test(token)) { coordinate = 0; return token }
    return String(n(Number(token) * scale + (coordinate++ % 2 ? baseline - (unit === 1 ? 3.6 : 10.88) * scale : 0)))
  })
  return { unit, text: value, path, textX, baseline, width: textX + metrics.w, anchor: (unit === 1 ? 3 : (3.304 + 3.864) / 2) * scale }
}
