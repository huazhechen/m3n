import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeHairpinSegments } from './native-hairpin.js'
import { nativeBarInk, nativeBarPieces, nativeLaneBarPositions } from './native-bars.js'
import { NativeSymbols, attrs, n, line } from './native-symbols.js'
import { nativeArcGeometry, nativeArcPath, type NativeArc } from './native-arc.js'
import { prepareNativeArc, nativeArcInkLift, nativeRibbonClearance, nativeRibbonRange } from './native-curve.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSvgInk, nativeSvgPieces, type NativeInk } from './native-ink.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRelationLayout = { svg: string; ink: NativeInk; arc?: NativeArc }
class NativeRelationPainter extends NativeSymbols {
  constructor(measurer: TextMeasurer, private readonly systems: readonly NativeSystem[]) { super(measurer) }
  relation(relation: NativeRelation, system: NativeSystem, preparedArc?: NativeArc): string {
    const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === relation.first.lane)
    const lane = system.lanes.find(lane => lane.id === relation.first.lane)
    if (!members.length || !lane) return ''
    if (relation.kind === 'inst') {
      const first = relation.first, last = relation.last
      const opens = members.includes(first), closes = members.includes(last)
      if (!opens && !closes) return ''
      const role = 'instrument-parenthesis'
      const baseline = (text: string) => {
        const metrics = this.measurer.measureText(text, {fontSize:nativeStyle.music, fontFamily:SCORE_NUMBER_FONT})
        return nativeMusicAxis(this.measurer) + metrics.baseline - metrics.h / 2
      }
      // The text origin uses advance width; reservation also includes any ink
      // outside that advance. Subtracting the reservation would lose it again.
      const leftWidth = this.measurer.measureText('(', {fontSize:nativeStyle.music, fontFamily:SCORE_NUMBER_FONT}).w
      // Stroke caps, accidentals and stacked music can extend beyond the
      // rhythmic advance. Use the already measured music ink at both ends;
      // lyric padding remains independent of the instrumental enclosure.
      const left = Math.max(first.musicLeft ?? first.left, first.inkLeft ?? 0)
      const right = Math.max(last.musicRight ?? last.right, last.inkRight ?? 0)
      return (opens ? this.text('(', first.x - left - leftWidth - first.parenthesisGap!, baseline('('), nativeStyle.music, SCORE_NUMBER_FONT, { 'data-m3n-role': role }) : '')
        + (closes ? this.text(')', last.x + right + last.parenthesisGap!, baseline(')'), nativeStyle.music, SCORE_NUMBER_FONT, { 'data-m3n-role': role }) : '')
    }
    if (relation.kind === 'tie' || relation.kind === 'slur') {
      const arc = preparedArc ?? nativeArcGeometry(relation, system)
      return `<path${attrs({ d: nativeArcPath(arc), fill: '#000', transform: 'translate(0 0)', 'data-m3n-relation': relation.kind })}/>`
    }
    if (relation.kind === 'cresc' || relation.kind === 'decres') {
      const segment = nativeHairpinSegments(relation,this.systems).find(segment => segment.system === system)
      if (!segment) return ''
      const {left,right,startHalf,endHalf,stroke} = segment
      return line(left,-startHalf,right,-endHalf,stroke)+line(left,startHalf,right,endHalf,stroke)
    }
    if (relation.kind === 'tuplet') {
      const bracket = nativeTupletGeometry(relation, system, this.measurer)
      return `<g${attrs({ 'data-m3n-relation': 'tuplet' })}>`
        + bracket.segments.map(([a, b, c, d]) => line(a, b, c, d, bracket.stroke)).join('')
        + this.text(relation.label!, bracket.center, bracket.baseline, bracket.fontSize, SCORE_NUMBER_FONT, { 'text-anchor': 'middle' }) + '</g>'
    }
    return ''
  }

}

/** Cache the final geometry, after clearing actual overlapping painted regions. */
export function placeNativeRelation(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer, systems: readonly NativeSystem[] = [system]): NativeRelationLayout {
  const painter = new NativeRelationPainter(measurer,systems)
  const isArc = relation.kind === 'tie' || relation.kind === 'slur'
  const initialArc = isArc ? nativeArcGeometry(relation, system) : undefined
  let svg = painter.relation(relation, system, initialArc), ink = nativeSvgInk(svg, measurer)
  let placedArc: NativeArc | undefined
  if (relation.kind !== 'inst') {
    const preceding = [...(system.relationLayout ?? [])].filter(([r, placed]) => r.kind !== 'inst' && r.first.lane === relation.first.lane && placed.ink.right > ink.left && placed.ink.left < ink.right)
    const labels = (system.decorationLayout ?? []).filter(label => label.lane === relation.first.lane && !label.svg.includes('data-m3n-role="measure-number"'))
      .flatMap(label => nativeSvgPieces(label.svg, measurer))
      .filter(label => label.right > ink.left && label.left < ink.right)
    let dy = 0
    if (!isArc) {
      const blockers: { top: number }[] = [...preceding.map(([, placed]) => placed.ink), ...labels]
      if (relation.kind !== 'tuplet') {
        const glyphs = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === relation.first.lane)
        const obstacles = glyphs
          .filter(g => g.x + (g.inkRight ?? g.musicRight ?? g.right) >= ink.left && g.x - (g.inkLeft ?? g.musicLeft ?? g.left) <= ink.right)
          .map(g => ({ top: -(g.musicTop ?? g.top) }))
        const controls = glyphs.flatMap(g => g.controls.flatMap(placedNativeControlInk))
          .filter(b => b.right > ink.left && b.left < ink.right)
        blockers.push(...obstacles, ...controls)
      }
      const hairpin = relation.kind === 'cresc' || relation.kind === 'decres'
      // Continuations also clear the actual painted bar ink.
      if (hairpin) {
        for (const [index] of system.measures.entries()) for (const bar of nativeLaneBarPositions(system.measures, index, relation.first.lane)) {
          const bounds = nativeBarInk(bar.kind, bar.x, 0, measurer)
          if (bounds.right > ink.left && bounds.left < ink.right) blockers.push(bounds)
        }
      }
      dy = Math.min(0, ...blockers.map(b => hairpin ? b.top-nativeStyle.music*.62 : b.top-nativeStyle.markGap-ink.bottom))
    }
    if (isArc) {
      const arc = initialArc!
      const bars = system.measures.flatMap((_, index) =>
        nativeLaneBarPositions(system.measures, index, relation.first.lane).flatMap(bar => nativeBarPieces(bar.kind, bar.x, 0, measurer)))
      const pieces = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
        .filter(g => g.lane === relation.first.lane)
        .flatMap(g => [
          ...(g.musicInk ?? []).map(piece => ({ ...piece, left: g.x + piece.left, right: g.x + piece.right })),
          ...g.controls.flatMap(placedNativeControlInk),
        ])
      let lift = 0
      const compare = (a: typeof relation.first, b: typeof relation.first) => (a.event?.sourceStart ?? 0) - (b.event?.sourceStart ?? 0) || a.slot - b.slot || a.time - b.time
      for (const [peer, placed] of preceding) {
        if (placed.arc) {
          // A shared endpoint alone is adjacency, not an outer musical layer.
          if (compare(peer.last, relation.first) <= 0 || compare(peer.first, relation.last) >= 0) continue
          lift = Math.max(lift, nativeRibbonClearance(arc, placed.arc, nativeStyle.music * .15, nativeStyle.music * 1e-6))
        } else {
          const piece = placed.ink
          if (piece.right <= arc.left || piece.left >= arc.right) continue
          const edge = nativeRibbonRange(arc, piece.left, piece.right)
          if (edge) lift = Math.max(lift, edge.bottom - piece.top + nativeStyle.music * .15)
        }
      }
      dy = -nativeArcInkLift(arc.commands, arc.left, arc.right, [...pieces, ...labels, ...bars], lift, arc.slicer)
      placedArc = { ...arc, top: arc.top - dy, commands: arc.commands.map(command => {
        if (command.op === 'Z') return command
        if (command.op === 'C') return { ...command, y: command.y + dy, cy1: command.cy1 + dy, cy2: command.cy2 + dy }
        if (command.op === 'Q') return { ...command, y: command.y + dy, cy: command.cy + dy }
        return { ...command, y: command.y + dy }
      }) }
      Object.defineProperty(placedArc, 'slicer', { value: dy ? prepareNativeArc(placedArc.commands) : arc.slicer })

    }
    if (dy) {
      svg = `<g transform="translate(0 ${n(dy)})">${svg}</g>`
      ink = nativeSvgInk(svg, measurer)
    }
  }
  return { svg, ink, arc: placedArc }
}
