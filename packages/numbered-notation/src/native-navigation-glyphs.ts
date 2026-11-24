import type { TextMeasurer } from './native-measure.js'
import { bravuraGlyph } from './bravura.js'

export type NativeNavigationGlyph = 'coda' | 'segno'
export const nativeNavigationGlyph = (name: NativeNavigationGlyph, height: number, measurer?: TextMeasurer) => bravuraGlyph(name, height, false, measurer)
