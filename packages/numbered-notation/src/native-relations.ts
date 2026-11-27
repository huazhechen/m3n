import { isNativeMeasureNumber } from './native-system-labels.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeAttachmentGap, nativeCoreGap, nativeStyle } from './native-style.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeHairpinSegments } from './native-hairpin.js'
import { nativeBarInk, nativeBarPieces, nativeLaneBarPositions } from './native-bars.js'
import { NativeSymbols, attrs, n, line } from './native-symbols.js'
import { nativeArcGeometry, nativeArcPath, nativeArcObstacles, nativeRelationMembers, type NativeArc } from './native-arc.js'
import { prepareNativeArc, nativeArcInkLift, nativeRibbonClearance, nativeRibbonRange } from './native-curve.js'
import { nativeTupletGeometry, nativeTupletPeers } from './native-tuplet.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSvgInk, nativeSvgPieces, unionNativeInk, type NativeInk } from './native-ink.js'
import type { NativeRelation, NativeSystem } from './native-layout-model.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRelationLayout = { svg: string; ink: NativeInk; pieces?: NativeInk[]; arc?: NativeArc }
class NativeRelationPainter extends NativeSymbols {
  constructor(measurer: TextMeasurer, private readonly systems: readonly NativeSystem[]) { super(measurer) }
  relation(relation: NativeRelation, system: NativeSystem, preparedArc?: NativeArc): string {
    const members = nativeRelationMembers(system,relation.first.lane)
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

/** Numeric primitives are also the input of final relation serialization. */
function relationPieces(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer,
  systems: readonly NativeSystem[], arc?: NativeArc): NativeInk[] {
  if (arc) {
    const range = nativeRibbonRange(arc, arc.left, arc.right)
    return range ? [{ left: arc.left, right: arc.right, ...range }] : []
  }
  if (relation.kind === 'tuplet') return nativeTupletGeometry(relation, system, measurer).pieces
  if (relation.kind === 'cresc' || relation.kind === 'decres') {
    const segment = nativeHairpinSegments(relation, systems).find(segment => segment.system === system)
    if (!segment) return []
    const { left, right, startHalf, endHalf, stroke } = segment, half = n(stroke) / 2
    return [-1, 1].map(sign => ({ left: n(left) - half, right: n(right) + half,
      top: Math.min(n(sign * startHalf), n(sign * endHalf)) - half,
      bottom: Math.max(n(sign * startHalf), n(sign * endHalf)) + half }))
  }
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
  const result: NativeInk[] = []
  for (const [text, glyph, opening] of [['(', relation.first, true], [')', relation.last, false]] as const) {
    if (!glyphs.includes(glyph)) continue
    const metrics = measurer.measureText(text, { fontSize: nativeStyle.music, fontFamily: SCORE_NUMBER_FONT })
    const baseline = nativeMusicAxis(measurer) + metrics.baseline - metrics.h / 2
    const x = opening ? glyph.x - Math.max(glyph.musicLeft ?? glyph.left, glyph.inkLeft ?? 0) - metrics.w - glyph.parenthesisGap!
      : glyph.x + Math.max(glyph.musicRight ?? glyph.right, glyph.inkRight ?? 0) + glyph.parenthesisGap!
    result.push({ left: n(x) + (metrics.inkLeft ?? 0), right: n(x) + (metrics.inkRight ?? metrics.w),
      top: n(baseline) - metrics.baseline, bottom: n(baseline) - metrics.baseline + (metrics.inkBottom ?? metrics.h) })
  }
  return result
}

/** Cache the final geometry, after clearing actual overlapping painted regions. */
export function placeNativeRelation(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer, systems: readonly NativeSystem[] = [system]): NativeRelationLayout {
  const painter = new NativeRelationPainter(measurer,systems)
  const isArc = relation.kind === 'tie' || relation.kind === 'slur'
  const initialArc = isArc ? nativeArcGeometry(relation, system) : undefined
  const numeric = Boolean(system.numericGeometry)
  let pieces = numeric ? relationPieces(relation, system, measurer, systems, initialArc) : undefined
  let svg = numeric ? '' : painter.relation(relation, system, initialArc)
  let ink = pieces?.length ? unionNativeInk(pieces) : nativeSvgInk(svg, measurer)
  let finalDy = 0
  let placedArc: NativeArc | undefined
  if (relation.kind !== 'inst') {
    const preceding = [...(system.relationLayout ?? [])].filter(([r, placed]) => r.kind !== 'inst' && r.first.lane === relation.first.lane && placed.ink.right > ink.left && placed.ink.left < ink.right)
    const labels = (system.decorationLayout ?? []).filter(label => label.lane === relation.first.lane && !isNativeMeasureNumber(label))
      .flatMap(label => nativeSvgPieces(label.svg, measurer))
      .filter(label => label.right > ink.left && label.left < ink.right)
    let dy = 0
    if (!isArc) {
      const blockers: { top: number }[] = [...preceding.map(([, placed]) => placed.ink), ...labels]
      if (relation.kind !== 'tuplet') {
        const glyphs = nativeRelationMembers(system,relation.first.lane)
        const obstacles = glyphs
          .filter(g => g.x + (g.inkRight ?? g.musicRight ?? g.right) >= ink.left && g.x - (g.inkLeft ?? g.musicLeft ?? g.left) <= ink.right)
          .map(g => ({ top: -(g.musicTop ?? g.top) }))
        const controls = glyphs.flatMap(g => g.controls.flatMap(placedNativeControlInk))
          .filter(b => b.right > ink.left && b.left < ink.right)
        blockers.push(...obstacles, ...controls)
      }
      if (relation.kind === 'tuplet') {
        // An incoming tie can clear only one bracket. Compute the final lift
        // for the complete adjacent group before placing any of its members.
        for (const peer of nativeTupletPeers(relation, system)) {
          const peerInk = numeric ? unionNativeInk(relationPieces(peer, system, measurer, systems)) : nativeSvgInk(painter.relation(peer, system), measurer)
          const peerBlockers = [...(system.relationLayout ?? [])]
            .filter(([r, placed]) => r.kind !== 'inst' && r.kind !== 'tuplet' && r.first.lane === peer.first.lane
              && placed.ink.right > peerInk.left && placed.ink.left < peerInk.right)
            .map(([, placed]) => placed.ink)
          const peerLabels = (system.decorationLayout ?? [])
            .filter(label => label.lane === peer.first.lane && !isNativeMeasureNumber(label))
            .flatMap(label => nativeSvgPieces(label.svg, measurer))
            .filter(label => label.right > peerInk.left && label.left < peerInk.right)
          dy = Math.min(dy, ...[...peerBlockers, ...peerLabels]
            .map(b => b.top - nativeAttachmentGap(system.coreGap) - peerInk.bottom))
        }
      }
      const hairpin = relation.kind === 'cresc' || relation.kind === 'decres'
      // Continuations also clear the actual painted bar ink.
      if (hairpin) {
        for (const [index] of system.measures.entries()) for (const bar of nativeLaneBarPositions(system.measures, index, relation.first.lane)) {
          const bounds = nativeBarInk(bar.kind, bar.x, 0, measurer)
          if (bounds.right > ink.left && bounds.left < ink.right) blockers.push(bounds)
        }
      }
      dy = Math.min(dy, ...blockers.map(b => hairpin ? b.top-nativeStyle.music*.5 : b.top-nativeAttachmentGap(system.coreGap)-ink.bottom))
    }
    if (isArc) {
      const arc = initialArc!
      // Bare collision avoidance permits a ribbon to touch a bar. Reserve
      // a music-size clearance around its actual painted pieces, independent of leading.
      const barGap = nativeStyle.music / 12
      const bars = system.measures.flatMap((_, index) =>
        nativeLaneBarPositions(system.measures, index, relation.first.lane).flatMap(bar =>
          nativeBarPieces(bar.kind, bar.x, 0, measurer).map(piece => ({
            left: piece.left - barGap, right: piece.right + barGap,
            top: piece.top - barGap, bottom: piece.bottom + barGap,
          }))))
      const pieces = nativeArcObstacles(system,relation.first.lane)
      let lift = 0
      const compare = (a: typeof relation.first, b: typeof relation.first) => (a.event?.sourceStart ?? 0) - (b.event?.sourceStart ?? 0) || a.slot - b.slot || a.time - b.time
      for (const [peer, placed] of preceding) {
        if (placed.arc) {
          // A shared endpoint alone is adjacency, not an outer musical layer.
          if (compare(peer.last, relation.first) <= 0 || compare(peer.first, relation.last) >= 0) continue
          lift = Math.max(lift, nativeRibbonClearance(arc, placed.arc, (system.coreGap ?? nativeCoreGap()) * .12, nativeStyle.music * 1e-6))
        } else {
          // A rhythm numeral is higher than its bracket arms. Keep each
          // primitive's own footprint instead of spreading the numeral's
          // top across the entire tuplet (and unnecessarily lifting the bow).
          for (const piece of placed.pieces ?? nativeSvgPieces(placed.svg, measurer)) {
            if (piece.right <= arc.left || piece.left >= arc.right) continue
            const edge = nativeRibbonRange(arc, piece.left, piece.right)
            if (edge) lift = Math.max(lift, edge.bottom - piece.top + (system.coreGap ?? nativeCoreGap()) * .12)
          }
        }
      }
      // nativeArcGeometry already clears the music to a fixed point. With
      // no preceding-relation lift or additional overlapping label/bar ink,
      // the identical music obstacles cannot require another pass.
      const addedInk = [...labels, ...bars]
      const overlapsAdded = addedInk.some(piece => Math.min(arc.right,piece.right)-Math.max(arc.left,piece.left)>=1e-8)
      dy = lift || overlapsAdded
        ? -nativeArcInkLift(arc.commands, arc.left, arc.right, [...pieces, ...addedInk], lift, arc.slicer) : -0
      placedArc = { ...arc, top: arc.top - dy, commands: arc.commands.map(command => {
        if (command.op === 'Z') return command
        if (command.op === 'C') return { ...command, y: command.y + dy, cy1: command.cy1 + dy, cy2: command.cy2 + dy }
        if (command.op === 'Q') return { ...command, y: command.y + dy, cy: command.cy + dy }
        return { ...command, y: command.y + dy }
      }) }
      Object.defineProperty(placedArc, 'slicer', { value: dy ? prepareNativeArc(placedArc.commands) : arc.slicer })

    }
    finalDy = dy
    if (dy && numeric) {
      pieces = pieces!.map(piece => ({ ...piece, top: piece.top + dy, bottom: piece.bottom + dy }))
      ink = unionNativeInk(pieces)
    } else if (dy) {
      svg = `<g transform="translate(0 ${n(dy)})">${svg}</g>`
      ink = nativeSvgInk(svg, measurer)
    }
  }
  return { get svg() {
    if (numeric && !svg) {
      svg = painter.relation(relation, system, initialArc)
      if (finalDy) svg = `<g transform="translate(0 ${n(finalDy)})">${svg}</g>`
    }
    return svg
  }, ink, pieces, arc: placedArc }
}
