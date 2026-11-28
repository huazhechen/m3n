import { scoreLayoutConfig } from './score-layout-config.js'
import type { NativeRelation, NativeSystem } from './native-layout-model.js'
import type { NativeGlyph } from './native-model.js'

export type NativeHairpinSegment = { system: NativeSystem; left: number; right: number; startHalf: number; endHalf: number; stroke: number }
type HairpinContext = { segments: Map<NativeRelation, NativeHairpinSegment[]>; positions?: Map<NativeGlyph, number>; members: WeakMap<NativeSystem, Map<string, NativeGlyph[]>> }
const contexts=new WeakMap<readonly NativeSystem[],HairpinContext>()
export function cacheNativeHairpins(systems:readonly NativeSystem[]){contexts.set(systems,{segments:new Map(),members:new WeakMap()})}
export function releaseNativeHairpins(systems:readonly NativeSystem[]){contexts.delete(systems)}

/** One continuous wedge, cut at the final system boundaries. Opening progress
 * follows engraved distance across all fragments, including page breaks.
 * Endpoints cover the host's measured music, including a single-event range.
 */
export function nativeHairpinSegments(relation: NativeRelation, systems: readonly NativeSystem[]): NativeHairpinSegment[] {
  const context=contexts.get(systems),cache=context?.segments,saved=cache?.get(relation)
  if(saved)return saved
  const members = (system: NativeSystem) => {
    let lanes = context?.members.get(system)
    if (!lanes) {
      lanes = new Map<string, NativeGlyph[]>()
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) {
        let lane = lanes.get(glyph.lane)
        if (!lane) { lane = []; lanes.set(glyph.lane, lane) }
        lane.push(glyph)
      }
      context?.members.set(system, lanes)
    }
    return lanes.get(relation.first.lane) ?? []
  }
  if (context && !context.positions) {
    context.positions = new Map()
    systems.forEach((system, index) => {
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs)
        if (!context.positions!.has(glyph)) context.positions!.set(glyph, index)
    })
  }
  const begin = context ? context.positions!.get(relation.first) ?? -1 : systems.findIndex(system => members(system).includes(relation.first))
  const end = relation.last.lane !== relation.first.lane ? -1 : context ? context.positions!.get(relation.last) ?? -1 : systems.findIndex(system => members(system).includes(relation.last))
  if (begin < 0 || end < begin) return []
  const { hairpinStroke: stroke, hairpinHalfOpening: opening } = scoreLayoutConfig.numbered
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
  const half = (position: number) => opening*(relation.kind === 'decres' ? 1-position/total : position/total)
  const result=ranges.map(range => {
    const startHalf = half(distance)
    distance += range.right-range.left
    return {...range,startHalf,endHalf:half(distance),stroke}
  })
  cache?.set(relation,result)
  return result
}
