import type { NativeSystem } from './native-layout-model.js'
import type { TextMeasurer } from './native-measure.js'
import type { NativeGlyph } from './native-model.js'
import { nativeSvgPieces, unionNativeInk, type NativeInk } from './native-ink.js'
import { NativeMusicPainter } from './native-music.js'
import { nativeRibbonRange } from './native-curve.js'
import { placedNativeLyricPieces } from './native-lyrics.js'

type Extent = { top: number; bottom: number }
export type NativeCoreProfile = NativeInk & { range?: (left: number, right: number) => Extent | undefined }
const coreBoxes=new WeakMap<NativeInk[],NativeInk>()
function coreBox(pieces:NativeInk[]) {
  let box=coreBoxes.get(pieces)
  if(!box){box=unionNativeInk(pieces);coreBoxes.set(pieces,box)}
  return box
}

/** Cells partition musical space, rather than weighting by note count or ink
 * density. Split at attachment edges so a small symbol cannot claim a full
 * cell. Overlapping symbols contribute the outer envelope, never a sum.
 * Curves supply exact local interval bounds instead of their full-row peak. */
export function weightedNativeCore(cells: readonly NativeInk[], profiles: readonly NativeCoreProfile[] = []): Extent | undefined {
  let width = 0, upper = 0, lower = 0
  for (const cell of cells) {
    if (cell.right <= cell.left) continue
    const peers = profiles.filter(p => p.right > cell.left && p.left < cell.right)
    if(!peers.length) {
      const span=cell.right-cell.left
      upper+=Math.min(0,cell.top)*span;lower+=Math.max(0,cell.bottom)*span;width+=span
      continue
    }
    const edges = [...new Set([cell.left, cell.right, ...peers.flatMap(p => [Math.max(cell.left, p.left), Math.min(cell.right, p.right)])])].sort((a, b) => a - b)
    for (let i = 1; i < edges.length; i++) {
      const left = edges[i - 1]!, right = edges[i]!, span = right - left
      let top = Math.min(0, cell.top), bottom = Math.max(0, cell.bottom)
      for (const peer of peers) {
        if (!(peer.right > left && peer.left < right)) continue
        const extent = peer.range ? peer.range(left, right) : peer
        if (!extent) continue
        top = Math.min(top, extent.top); bottom = Math.max(bottom, extent.bottom)
      }
      upper += top * span
      lower += bottom * span
      width += span
    }
  }
  return width > 0 ? { top: upper / width, bottom: lower / width } : undefined
}

/** Average each lane independently, then translate into system coordinates.
 * Lyrics keep their complete local envelope; other annotations still enter
 * the separate painted-ink collision constraints. */
export function nativeSystemCore(system: NativeSystem, measurer: TextMeasurer): Extent | undefined {
  const painter = new NativeMusicPainter(measurer), cores: Extent[] = []
  for (const lane of system.lanes) {
    const columns:{x:number;ink:NativeInk;glyphs:NativeGlyph[]}[]=[]
    for(const measure of system.measures)for(const column of measure.columns) {
      const glyphs:NativeGlyph[]=[]
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity
      for(const g of column.glyphs)if(g.lane===lane.id) {
        glyphs.push(g)
        const numeric=system.numericGeometry && g.coreInk
        const box=numeric ? coreBox(g.coreInk!) : unionNativeInk(painter.musicPieces({...g,y:0},undefined,true))
        const offset=numeric && g.coreInk!.length ? g.x : 0
        left=Math.min(left,box.left+offset);right=Math.max(right,box.right+offset)
        top=Math.min(top,box.top);bottom=Math.max(bottom,box.bottom)
      }
      if(glyphs.length)columns.push({x:column.x,ink:{left,right,top,bottom},glyphs})
    }
    const cells = columns.map((column, index) => ({ ...column.ink,
      left: index ? (columns[index - 1]!.x + column.x) / 2 : column.ink.left,
      right: index + 1 < columns.length ? (column.x + columns[index + 1]!.x) / 2 : column.ink.right,
    }))
    const profiles: NativeCoreProfile[] = []
    for (const [relation, placed] of system.relationLayout ?? []) {
      if (relation.first.lane !== lane.id || !['tie', 'slur', 'tuplet'].includes(relation.kind)) continue
      if (placed.arc) {
        const arc = placed.arc
        profiles.push({ ...placed.ink, range: (left, right) => nativeRibbonRange(arc, left, right) })
      } else profiles.push(...(system.numericGeometry && placed.pieces ? placed.pieces : nativeSvgPieces(placed.svg, measurer)))
    }
    const core = weightedNativeCore(cells, profiles)
    if (!core) continue
    for (const column of columns) for (const glyph of column.glyphs) for (const [row, baseline] of glyph.lyricBaselines ?? []) {
      const data = glyph.lyrics.get(row)
      if (!data || !(data.texts.some(text => text.replaceAll('\u200B', '').trim()) || data.annotation)) continue
      const ink = unionNativeInk(placedNativeLyricPieces(glyph,row,baseline,measurer))
      core.top = Math.min(core.top, ink.top); core.bottom = Math.max(core.bottom, ink.bottom)
    }
    cores.push({ top: core.top + lane.y, bottom: core.bottom + lane.y })
  }
  return cores.length ? { top: Math.min(...cores.map(c => c.top)), bottom: Math.max(...cores.map(c => c.bottom)) } : undefined
}
