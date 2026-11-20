import { bravuraGlyph } from './bravura.js'

export type NativeNavigationGlyph = 'coda' | 'segno'
export const nativeNavigationGlyph = (name: NativeNavigationGlyph, height: number) => bravuraGlyph(name, height)
