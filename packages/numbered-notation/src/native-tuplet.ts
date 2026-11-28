import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import type { NativeRelation, NativeSystem } from './native-layout-model.js'
import type { TextMeasurer } from './native-measure.js'
import { placedNativeControlInk } from './native-controls.js'

type TupletGeometry={pieces:{left:number;right:number;top:number;bottom:number}[];segments:[number,number,number,number][];
  stroke:number;center:number;baseline:number;fontSize:number;left:number;right:number;top:number}
const contexts=new WeakMap<NativeSystem,{peers:Map<NativeRelation,NativeRelation[]>;geometry:Map<NativeRelation,TupletGeometry>}>()
/** Row membership and horizontal placement are final before relations are
 * measured. Adjacent brackets share one level and one numeric preparation. */
export function cacheNativeTuplets(system:NativeSystem){contexts.set(system,{peers:new Map(),geometry:new Map()})}
export function releaseNativeTuplets(system:NativeSystem){contexts.delete(system)}

/** Adjacent rhythm brackets in one measure form a vertical alignment group. */
export function nativeTupletPeers(relation: NativeRelation, system: NativeSystem) {
  const cache=contexts.get(system),saved=cache?.peers.get(relation)
  if(saved)return saved
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    .filter(glyph => glyph.lane === relation.first.lane)
  const spans = system.relations.filter(item => item.kind === 'tuplet' && item.first.lane === relation.first.lane
    && item.first.measureId === relation.first.measureId)
    .map(item => ({ item, start: glyphs.indexOf(item.first), end: glyphs.indexOf(item.last) }))
    .filter(span => span.start >= 0 && span.end >= span.start).sort((a, b) => a.start - b.start)
  const current = spans.findIndex(span => span.item === relation)
  let first = current, last = current
  while (first > 0 && spans[first - 1]!.end + 1 === spans[first]!.start) first--
  while (last >= 0 && last + 1 < spans.length && spans[last]!.end + 1 === spans[last + 1]!.start) last++
  const peers=current < 0 ? [relation] : spans.slice(first, last + 1).map(span => span.item)
  if(cache)for(const peer of peers)cache.peers.set(peer,peers)
  return peers
}

/** Brackets use lane-relative coordinates so pagination only translates them. */
export function nativeTupletGeometry(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer) {
  return contexts.get(system)?.geometry.get(relation) ?? calculateTupletGeometry(relation,system,measurer)
}
function calculateTupletGeometry(relation: NativeRelation, system: NativeSystem, measurer: TextMeasurer) {
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    .filter(glyph => glyph.lane === relation.first.lane)
  const peers = nativeTupletPeers(relation, system)
  const size = nativeStyle.music, fontSize = (nativeStyle.music * .7), hook = size * 0.18, gap = size * 0.14
  const stroke = Math.max((nativeStyle.music * .04), size * 0.055), halfStroke = stroke / 2
  const halfBody = measurer.measureText('0', { fontSize: size, fontFamily: SCORE_NUMBER_FONT }).w / 2
  const shape = (peer: NativeRelation) => {
    const text = measurer.measureText(peer.label ?? '', { fontSize, fontFamily: SCORE_NUMBER_FONT, textAlign: 'center' })
    // Stroke caps belong inside the row, even when the first head is flush.
    const left = Math.max(system.measures[0]!.start + halfStroke, peer.first.x - halfBody)
    const right = Math.min(system.measures.at(-1)!.end - halfStroke, peer.last.x + halfBody), center = (left + right) / 2
    const textLeft = center - text.w / 2 - size * 0.12, textRight = center + text.w / 2 + size * 0.12
    const segments: [number, number, number, number][] = [[left, 0, left, hook], [right, 0, right, hook]]
    if (textLeft > left) segments.push([left, 0, textLeft, 0])
    if (textRight < right) segments.push([textRight, 0, right, 0])
    const textX = center - (text.advance ?? text.w) / 2 - (text.centerOffset ?? 0)
    const pieces = [{ left: textX + (text.inkLeft ?? 0), right: textX + (text.inkRight ?? text.w),
      top: -text.h / 2, bottom: -text.h / 2 + (text.inkBottom ?? text.h) },
    ...segments.map(([x1, y1, x2, y2]) => ({ left: Math.min(x1, x2) - halfStroke, right: Math.max(x1, x2) + halfStroke,
      top: Math.min(y1, y2) - halfStroke, bottom: Math.max(y1, y2) + halfStroke }))]
    return { text, center, segments, pieces }
  }
  const shapes=new Map(peers.map(peer=>[peer,shape(peer)]))
  const obstacles = glyphs.flatMap(glyph => [
    ...(glyph.musicInk ?? []).map(ink => ({ ...ink, left: glyph.x + ink.left, right: glyph.x + ink.right })),
    ...glyph.controls.flatMap(placedNativeControlInk),
  ])
  const y = Math.min(...peers.map(peer => {
    const { text, pieces } = shapes.get(peer)!
    // Keep the complete mark above the note baseline, then fit each painted
    // piece to the music beneath it. An octave dot under a horizontal stroke
    // must not also reserve the deeper label's height across the whole group.
    let level = -gap - Math.max(hook, text.h / 2)
    for (const ink of obstacles) for (const mark of pieces) {
      if (ink.right <= mark.left || ink.left >= mark.right) continue
      level = Math.min(level, ink.top - gap - mark.bottom)
    }
    return level
  }))
  const finish=(peer:NativeRelation)=>{
  const { text, center, segments, pieces } = shapes.get(peer)!
  return { pieces: pieces.map(piece => ({ ...piece, top: piece.top + y, bottom: piece.bottom + y })), segments: segments.map(([x1, y1, x2, y2]): [number, number, number, number] => [x1, y1 + y, x2, y2 + y]),
    stroke, center, baseline: y - text.h / 2 + text.baseline, fontSize,
    left: Math.min(...pieces.map(piece => piece.left)), right: Math.max(...pieces.map(piece => piece.right)),
    top: -y - Math.min(...pieces.map(piece => piece.top)) }
  }
  const cache=contexts.get(system)
  if(cache){for(const peer of peers)cache.geometry.set(peer,finish(peer));return cache.geometry.get(relation)!}
  return finish(relation)
}
