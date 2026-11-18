import { nativeStyle } from './native-style.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'

export type NativeHairpinSegment = { system: NativeSystem; left: number; right: number; startHalf: number; endHalf: number; stroke: number }

/** One continuous wedge, cut at the final system boundaries. Opening progress
 * follows engraved distance across all fragments, including page breaks.
 * Endpoints cover the host's measured music, including a single-event range.
 */
export function nativeHairpinSegments(relation: NativeRelation, systems: readonly NativeSystem[]): NativeHairpinSegment[] {
  const members = (system: NativeSystem) => system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === relation.first.lane)
  const begin = systems.findIndex(system => members(system).includes(relation.first))
  const end = systems.findIndex(system => members(system).includes(relation.last))
  if (begin < 0 || end < begin) return []
  const size = nativeStyle.music, stroke = size*.035
  const ranges = systems.slice(begin,end+1).flatMap((system,index) => {
    const glyphs = members(system)
    if (!glyphs.length) return []
    // Continuations start at the allocated music edge. Include half the
    // stroke at both outer boundaries so zero-margin SVGs remain unclipped.
    const left = Math.max(stroke/2, index === 0 ? relation.first.x-(relation.first.musicLeft ?? relation.first.left)
      : Math.min(...glyphs.map(g => g.x-(g.musicLeft ?? g.left))))
    const right = Math.min(system.measures.at(-1)!.end-stroke/2,
      system === systems[end] ? relation.last.x+(relation.last.musicRight ?? relation.last.right)
        : system.measures.at(-1)!.end)
    return right > left ? [{system,left,right}] : []
  })
  const total = ranges.reduce((sum,range) => sum+range.right-range.left,0)
  let distance = 0
  const half = (position: number) => size*.2*(relation.kind === 'decres' ? 1-position/total : position/total)
  return ranges.map(range => {
    const startHalf = half(distance)
    distance += range.right-range.left
    return {...range,startHalf,endHalf:half(distance),stroke}
  })
}
