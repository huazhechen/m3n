import { nativeCoreGap } from './native-style.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'

export type NativeMarkPlacement = { name: string; top: number; height: number; y: number; left: number; right: number; x?: number }
const nativeArticulation = (name: string) => ['tip', 'brk', 'hold', 'str'].includes(name)
export const nativeInnerMark = (name: string) => nativeArticulation(name)
  || ['tr', 'prall', 'fermata', 'breath'].includes(name) || /^f[1-5]$/.test(name)
export const nativeMarkRank = (name: string) => nativeArticulation(name) ? 0
  : /^(p{1,3}|f{1,3}|mp|mf|sfz)$/.test(name) || /^(cresc\.|dim\.|accel\.|rit\.)/.test(name) ? 2 : 1
/** Single-note marks sit inside relations, with articulations nearest the note.
 * Dynamics and expression text remain outside the enclosing relations.
 * Placement and SVG use the very same shapes, including italic text metrics. */
export function nativeMarkStack(names: readonly string[], bodyTop: number, measurer: TextMeasurer = new DefaultTextMeasurer(), coreGap = nativeCoreGap()) {
  const ordered = [...names].sort((a, b) => nativeMarkRank(a) - nativeMarkRank(b)), painter = new NativeSymbols(measurer)
  let top = bodyTop
  const items: NativeMarkPlacement[] = ordered.map(name => {
    const ink = nativeSvgInk(painter.rawMark(name), measurer), height = ink.bottom - ink.top
    const y = -top - (coreGap * .1) - ink.bottom
    top = height - (y + ink.bottom)
    return { name, top: -top, height, y, left: ink.left, right: ink.right }
  })
  return { items, top }
}
