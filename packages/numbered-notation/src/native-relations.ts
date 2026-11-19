import { nativeStyle } from './native-style.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeHairpinSegments } from './native-hairpin.js'
import { nativeBarSvg, nativeLaneBarPositions } from './native-bars.js'
import { NativeSymbols, attrs, n, line } from './native-symbols.js'
import { nativeArcGeometry, nativeArcPath, type NativeArc } from './native-arc.js'
import { nativeArcInkLift, nativeRibbonClearance, nativeRibbonRange } from './native-curve.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSvgInk, nativeSvgPieces, type NativeInk } from './native-ink.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRelationLayout = { svg: string; ink: NativeInk; arc?: NativeArc }
class NativeRelationPainter extends NativeSymbols {
  constructor(measurer: TextMeasurer, private readonly systems: readonly NativeSystem[]) { super(measurer) }
  relation(relation: NativeRelation, system: NativeSystem): string {
    const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === relation.first.lane)
    const lane = system.lanes.find(lane => lane.id === relation.first.lane)
    if (!members.length || !lane) return ''
    if (relation.kind === 'inst') {
      const selected = members.filter(glyph => glyph.event && relation.first.event!.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event!.sourceStart)
      if (!selected.length) return ''
      const first = selected[0]!, last = selected.at(-1)!
      const role = 'instrument-parenthesis'
      const baseline = (text: string) => {
        const metrics = this.measurer.measureText(text, {fontSize:nativeStyle.music, fontFamily:'M3N Numbers'})
        return nativeMusicAxis(this.measurer) + metrics.baseline - metrics.h / 2
      }
      // The text origin uses advance width; reservation also includes any ink
      // outside that advance. Subtracting the reservation would lose it again.
      const leftWidth = this.measurer.measureText('(', {fontSize:nativeStyle.music, fontFamily:'M3N Numbers'}).w
      // Stroke caps, accidentals and stacked music can extend beyond the
      // rhythmic advance. Use the already measured music ink at both ends;
      // lyric padding remains independent of the instrumental enclosure.
      const left = Math.max(first.musicLeft ?? first.left, first.inkLeft ?? 0)
      const right = Math.max(last.musicRight ?? last.right, last.inkRight ?? 0)
      return this.text('(', first.x - left - leftWidth - nativeStyle.music * 0.05, baseline('('), nativeStyle.music, 'M3N Numbers', { 'data-m3n-role': role })
        + this.text(')', last.x + right + nativeStyle.music * 0.05, baseline(')'), nativeStyle.music, 'M3N Numbers', { 'data-m3n-role': role })
    }
    if (relation.kind === 'gliss') {
      const firstHere = members.includes(relation.first), lastHere = members.includes(relation.last)
      const left = firstHere ? relation.first.x : system.arcContinuationLeft ?? members[0]!.x
      const right = lastHere ? relation.last.x : system.measures.at(-1)!.end
      const pitch = (glyph: typeof relation.first) => Number(glyph.pitches[0]?.degree) + 7 * (glyph.pitches[0]?.octave ?? 0)
      const up = pitch(relation.last) > pitch(relation.first)
      const height = nativeStyle.music * .35
      const y1 = up ? 0 : -height, y2 = up ? -height : 0
      return `<g data-m3n-relation="gliss">${line(left, y1, right, y2, nativeStyle.music * .055)}</g>`
    }
    if (relation.kind === 'tie' || relation.kind === 'slur') {
      const arc = nativeArcGeometry(relation, system)
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
        + this.text(relation.label!, bracket.center, bracket.baseline, bracket.fontSize, 'M3N Numbers', { 'text-anchor': 'middle' }) + '</g>'
    }
    return ''
  }

}

/** Cache the final geometry, after clearing actual overlapping painted regions. */
export function placeNativeRelation(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer, systems: readonly NativeSystem[] = [system]): NativeRelationLayout {
  const painter = new NativeRelationPainter(measurer,systems)
  let svg = painter.relation(relation, system), ink = nativeSvgInk(svg, measurer)
  let placedArc: NativeArc | undefined
  if (relation.kind !== 'inst') {
    const obstacles = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .filter(g => g.lane === relation.first.lane && g.x + (g.inkRight ?? g.musicRight ?? g.right) >= ink.left && g.x - (g.inkLeft ?? g.musicLeft ?? g.left) <= ink.right)
      .map(g => ({ left: g.x - (g.inkLeft ?? g.musicLeft ?? g.left), right: g.x + (g.inkRight ?? g.musicRight ?? g.right), top: -(g.musicTop ?? g.top) }))
    const controls = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === relation.first.lane)
      .flatMap(g => g.controls.flatMap(placedNativeControlInk))
      .filter(b => b.right > ink.left && b.left < ink.right)
    const preceding = [...(system.relationLayout ?? [])].filter(([r, placed]) => r.kind !== 'inst' && r.first.lane === relation.first.lane && placed.ink.right > ink.left && placed.ink.left < ink.right)
    const previous = preceding.map(([, placed]) => placed.ink)
    const labels = (system.decorationLayout ?? []).filter(label => label.lane === relation.first.lane)
      .flatMap(label => nativeSvgPieces(label.svg, measurer))
      .filter(label => label.right > ink.left && label.left < ink.right)
    const bars = system.measures.flatMap((_, index) =>
      nativeLaneBarPositions(system.measures, index, relation.first.lane).flatMap(bar => nativeSvgPieces(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)))
    const isArc = relation.kind === 'tie' || relation.kind === 'slur'
    const blockers = relation.kind === 'tuplet' ? [...previous, ...labels] : [...obstacles, ...controls, ...previous, ...labels]
    const hairpin = relation.kind === 'cresc' || relation.kind === 'decres'
    // Continuations reach the system boundary and therefore also cover bars.
    // Use their actual painted ink, not a nominal staff height.
    if (hairpin) {
      for (const [index] of system.measures.entries()) for (const bar of nativeLaneBarPositions(system.measures, index, relation.first.lane)) {
        const bounds = nativeSvgInk(nativeBarSvg(bar.kind,bar.x,0,measurer),measurer)
        if (bounds.right > ink.left && bounds.left < ink.right) blockers.push(bounds)
      }
    }
    let dy = isArc ? 0 : Math.min(0, ...blockers.map(b => hairpin ? b.top-nativeStyle.music*.62 : b.top-nativeStyle.markGap-ink.bottom))
    if (isArc) {
      const arc = nativeArcGeometry(relation, system)
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
      dy = -nativeArcInkLift(arc.commands, arc.left, arc.right, [...pieces, ...labels, ...bars], lift)
      placedArc = { ...arc, top: arc.top - dy, commands: arc.commands.map(command => {
        if (command.op === 'Z') return command
        if (command.op === 'C') return { ...command, y: command.y + dy, cy1: command.cy1 + dy, cy2: command.cy2 + dy }
        if (command.op === 'Q') return { ...command, y: command.y + dy, cy: command.cy + dy }
        return { ...command, y: command.y + dy }
      }) }

    }
    if (dy) {
      svg = `<g transform="translate(0 ${n(dy)})">${svg}</g>`
      ink = nativeSvgInk(svg, measurer)
    }
  }
  return { svg, ink, arc: placedArc }
}
