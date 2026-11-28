import { nativeAttachmentGap } from './native-style.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import type { NativeGlyph } from './native-model.js'
import { nativeBodyPieces } from './native-music-ink.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'

export type NativeMarkPlacement = { name: string; top: number; height: number; y: number; left: number; right: number; x?: number }
const nativeArticulation = (name: string) => ['tip', 'brk', 'hold', 'str'].includes(name)
export const nativeInnerMark = (name: string) => nativeArticulation(name)
  || ['tr', 'prall', 'fermata', 'breath'].includes(name) || /^f[1-5]$/.test(name)
export const nativeMarkRank = (name: string) => nativeArticulation(name) ? 0
  : /^(p{1,3}|f{1,3}|mp|mf|sfz)$/.test(name) || /^(cresc\.|dim\.|accel\.|rit\.)/.test(name) ? 2 : 1
export function nativeMarkInk(name: string, measurer: TextMeasurer): NativeInk {
  const create = () => Object.freeze(nativeSvgInk(new NativeSymbols(measurer).rawMark(name), measurer))
  return measurer.fixedSymbol?.(`mark-ink:${name}`, create) ?? create()
}
/** Single-note marks sit inside relations, with articulations nearest the note.
 * Dynamics and expression text remain outside the enclosing relations.
 * Placement and SVG use the very same shapes, including italic text metrics. */
export function nativeMarkStack(names: readonly string[], bodyTop: number, measurer: TextMeasurer = new DefaultTextMeasurer(), bodyPieces?: readonly NativeInk[]) {
  const ordered = [...names].sort((a, b) => nativeMarkRank(a) - nativeMarkRank(b))
  let top = bodyTop
  const items: NativeMarkPlacement[] = ordered.map((name, index) => {
    // Raw marks have no score coordinates. Share their parsed geometry with
    // the task's font-revision cache, just like the other fixed symbols.
    const ink = nativeMarkInk(name, measurer), height = ink.bottom - ink.top
    // A centered staccato only clears ink under its own horizontal footprint.
    // Keep the full body envelope for all other marks and for row occupancy.
    if (index === 0 && name === 'tip' && bodyPieces) {
      const overlapping = bodyPieces.filter(piece => piece.left < ink.right && piece.right > ink.left)
      if (overlapping.length) top = Math.max(...overlapping.map(piece => -piece.top))
    } else top = Math.max(top, bodyTop)
    const y = -top - nativeAttachmentGap() - ink.bottom
    top = height - (y + ink.bottom)
    return { name, top: -top, height, y, left: ink.left, right: ink.right }
  })
  return { items, top }
}

/** Preserve actual chord offsets when measuring the centered staccato column. */
export function nativeGlyphMarkStack(glyph: NativeGlyph, names: readonly string[], measurer: TextMeasurer, bodyTop = nativeNoteMetrics(glyph.pitches, glyph.writtenBeats, glyph.sustain, measurer).top) {
  const pieces = names.includes('tip') ? nativeBodyPieces({ ...glyph, x: 0, y: 0 }, measurer) : undefined
  return nativeMarkStack(names, bodyTop, measurer, pieces)
}
