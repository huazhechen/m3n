import { nativeStyle } from './native-style.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

/** Brackets use lane-relative coordinates so pagination only translates them. */
export function nativeTupletGeometry(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer) {
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    .filter(glyph => glyph.lane === relation.first.lane)
  const spans = system.relations.filter(item => item.kind === 'tuplet' && item.first.lane === relation.first.lane)
    .map(item => ({ item, start: glyphs.indexOf(item.first), end: glyphs.indexOf(item.last) }))
    .filter(span => span.start >= 0 && span.end >= span.start).sort((a, b) => a.start - b.start)
  const current = spans.findIndex(span => span.item === relation)
  let first = current, last = current
  while (first > 0 && spans[first - 1]!.end + 1 === spans[first]!.start) first--
  while (last >= 0 && last + 1 < spans.length && spans[last]!.end + 1 === spans[last + 1]!.start) last++
  const peers = current < 0 ? [relation] : spans.slice(first, last + 1).map(span => span.item)
  const size = nativeStyle.music, fontSize = size * 0.72, hook = size * 0.18, gap = size * 0.14
  const metrics = measurer.measureText(relation.label ?? '', { fontSize, fontFamily: 'serif' })
  const y = Math.min(...peers.map(peer => {
    const covered = glyphs.slice(glyphs.indexOf(peer.first), glyphs.indexOf(peer.last) + 1)
    const text = measurer.measureText(peer.label ?? '', { fontSize, fontFamily: 'serif' })
    return -Math.max(0, ...covered.map(glyph => glyph.musicTop ?? glyph.top)) - gap - Math.max(hook, text.h / 2)
  }))
  const halfBody = measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' }).w / 2
  const left = relation.first.x - halfBody, right = relation.last.x + halfBody, center = (left + right) / 2
  const textLeft = center - metrics.w / 2 - size * 0.12, textRight = center + metrics.w / 2 + size * 0.12
  const segments: [number, number, number, number][] = [[left, y, left, y + hook], [right, y, right, y + hook]]
  if (textLeft > left) segments.push([left, y, textLeft, y])
  if (textRight < right) segments.push([textRight, y, right, y])
  const stroke = Math.max(1, size * 0.055)
  return { segments, stroke, center, baseline: y - metrics.h / 2 + metrics.baseline, fontSize,
    left: left - stroke / 2, right: right + stroke / 2, top: -y + Math.max(metrics.h / 2, stroke / 2) }
}
