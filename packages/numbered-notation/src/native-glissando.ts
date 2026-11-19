import { nativeMusicAxis } from './native-axis.js'
import { attrs, n } from './native-symbols.js'
import { nativeStyle } from './native-style.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

/** A compact curved arrow in the gap, with its head only at the destination. */
export function nativeGlissandoSvg(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer): string {
  const glyphs = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
  const firstHere = glyphs.includes(relation.first), lastHere = glyphs.includes(relation.last)
  const size = nativeStyle.music, padding = size * .1
  const left = firstHere ? relation.first.x + (relation.first.musicRight ?? relation.first.right) + padding
    : system.arcContinuationLeft ?? system.measures[0]!.start
  const right = lastHere ? relation.last.x - (relation.last.musicLeft ?? relation.last.left) - padding
    : (system.measures.at(-1)!.barX ?? system.measures.at(-1)!.end) - padding
  const width = Math.min(size * .75, right - left)
  if (width <= 0) return ''
  const direction = relation.glissDirection ?? 0
  const height = Math.min(size * .45, width * .7)
  const x1 = (left + right - width) / 2, x2 = x1 + width
  const axis = nativeMusicAxis(measurer)
  const y1 = axis + direction * height / 2, y2 = axis - direction * height / 2
  const cx = x2 - width * .2, cy = y2 + direction * height * .55
  const shaft = `M ${n(x1)} ${n(y1)} C ${n(x1 + width * .6)} ${n(y1)} ${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`
  const length = Math.hypot(x2 - cx, y2 - cy), ux = (x2 - cx) / length, uy = (y2 - cy) / length
  const head = Math.min(size * .19, width * .32), half = head * .55
  const arrow = `M ${n(x2 - head * ux - half * uy)} ${n(y2 - head * uy + half * ux)} L ${n(x2)} ${n(y2)} L ${n(x2 - head * ux + half * uy)} ${n(y2 - head * uy - half * ux)}`
  return `<g${attrs({ 'data-m3n-relation': 'gliss', 'data-direction': direction > 0 ? 'up' : direction < 0 ? 'down' : 'level' })}>`
    + `<path${attrs({ d: shaft, fill: 'none', stroke: '#000', 'stroke-width': size * .05, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-m3n-role': 'gliss-curve' })}/>`
    + (lastHere ? `<path${attrs({ d: arrow, fill: 'none', stroke: '#000', 'stroke-width': size * .05, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-m3n-role': 'gliss-arrowhead' })}/>` : '') + '</g>'
}
