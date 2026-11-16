import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs, n, line } from './native-symbols.js'
import { nativeArcGeometry, nativeArcPath } from './native-arc.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRelationLayout = { svg: string; ink: NativeInk }
class NativeRelationPainter extends NativeSymbols {
  relation(relation: NativeRelation, system: NativeSystem): string {
    const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === relation.first.lane)
    const lane = system.lanes.find(lane => lane.id === relation.first.lane)
    if (!members.length || !lane) return ''
    const firstHere = members.includes(relation.first), lastHere = members.includes(relation.last)
    const x1 = firstHere ? relation.first.x : system.measures[0]!.start + em(4)
    const x2 = lastHere ? relation.last.x : system.measures.at(-1)!.end - em(5)
    const top = 0
    if (relation.kind === 'inst') {
      const selected = members.filter(glyph => glyph.event && relation.first.event!.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event!.sourceStart)
      if (!selected.length) return ''
      const first = selected[0]!, last = selected.at(-1)!
      const role = first.lane.startsWith('alternative:') ? 'alternative-parenthesis' : 'instrument-parenthesis'
      return this.text('(', first.x - first.left - (first.parenthesisLeft ?? em(6)), 0, nativeStyle.music, 'M3N Numbers', { 'data-m3n-role': role })
        + this.text(')', last.x + last.right + nativeStyle.music * 0.05, 0, nativeStyle.music, 'M3N Numbers', { 'data-m3n-role': role })
    }
    if (relation.kind === 'tie' || relation.kind === 'slur') {
      const arc = nativeArcGeometry(relation, system)
      return `<path${attrs({ d: nativeArcPath(arc), fill: '#000', transform: 'translate(0 0)', 'data-m3n-relation': relation.kind })}/>`
    }
    if (relation.kind === 'cresc' || relation.kind === 'decres') {
      const end = Math.max(x1 + em(14), x2), openLeft = relation.kind === 'decres'
      return line(x1, top - (openLeft ? em(4) : 0), end, top - (openLeft ? 0 : em(4))) + line(x1, top + (openLeft ? em(4) : 0), end, top + (openLeft ? 0 : em(4)))
    }
    if (relation.kind === 'tuplet') {
      const bracket = nativeTupletGeometry(relation, system, this.measurer)
      return `<g${attrs({ 'data-m3n-relation': 'tuplet' })}>`
        + bracket.segments.map(([a, b, c, d]) => line(a, b, c, d, bracket.stroke)).join('')
        + this.text(relation.label!, bracket.center, bracket.baseline, bracket.fontSize, 'serif', { 'text-anchor': 'middle' }) + '</g>'
    }
    const labelWidth = this.measurer.measureText(relation.label ?? '', { fontSize: nativeStyle.small, fontFamily: 'serif' }).w + nativeStyle.small * 0.3
    return this.text(relation.label!, x1, top - em(3), nativeStyle.small) + line(x1 + labelWidth, top - em(5), Math.max(x1 + labelWidth, x2), top - em(5), em(1), ` stroke-dasharray="${em(4)} ${em(3)}"`) + line(x2, top - em(5), x2, top + em(1))
  }

}

/** Cache the final geometry, after clearing actual overlapping painted regions. */
export function placeNativeRelation(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer): NativeRelationLayout {
  const painter = new NativeRelationPainter(measurer)
  let svg = painter.relation(relation, system), ink = nativeSvgInk(svg, measurer)
  if (relation.kind !== 'inst') {
    const obstacles = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .filter(g => g.lane === relation.first.lane && g.x + (g.inkRight ?? g.musicRight ?? g.right) >= ink.left && g.x - (g.inkLeft ?? g.musicLeft ?? g.left) <= ink.right)
      .map(g => ({ left: g.x - (g.inkLeft ?? g.musicLeft ?? g.left), right: g.x + (g.inkRight ?? g.musicRight ?? g.right), top: -(g.musicTop ?? g.top) }))
    const controls = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === relation.first.lane)
      .flatMap(g => g.controls.filter(c => c.x !== undefined).map(c => ({ left: c.x!, right: c.x! + c.width, top: -c.top })))
      .filter(b => b.right > ink.left && b.left < ink.right)
    const previous = [...(system.relationLayout ?? [])].filter(([r]) => r.kind !== 'inst' && r.first.lane === relation.first.lane)
      .map(([, placed]) => placed.ink).filter(b => b.right > ink.left && b.left < ink.right)
    const isArc = relation.kind === 'tie' || relation.kind === 'slur'
    const blockers = isArc ? previous : relation.kind === 'tuplet' ? [...controls, ...previous] : [...obstacles, ...controls, ...previous]
    const dy = Math.min(0, ...blockers.map(b => b.top - nativeStyle.markGap - ink.bottom))
    if (dy) {
      svg = `<g transform="translate(0 ${n(dy)})">${svg}</g>`
      ink = nativeSvgInk(svg, measurer)
    }
  }
  return { svg, ink }
}
