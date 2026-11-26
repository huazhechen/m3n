import type { NativeMeasure } from './native-model.js'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'

/** Split a dense bar into balanced musical groups, preserving every tuplet. */
export function splitNativeMeasure(measure: NativeMeasure, width: number): NativeMeasure[] {
  const capacity = width
  if (measure.minimum <= capacity || measure.columns.length < 2) return [measure]
  const tuplets = new Map<object, { start: number; end: number }>()
  for (const column of measure.columns) for (const glyph of column.glyphs) {
    if (glyph.event?.kind !== 'tuplet') continue
    const range = tuplets.get(glyph.event) ?? { start: Infinity, end: -Infinity }
    range.start = Math.min(range.start, glyph.time); range.end = Math.max(range.end, glyph.time + glyph.beats)
    tuplets.set(glyph.event, range)
  }
  const boundaries = measure.columns.flatMap((column, index) => [...tuplets.values()].some(range => column.time > range.start + 1e-7 && column.time < range.end - 1e-7) ? [] : [index])
  const groups = boundaries.map((start, index) => {
    const stop = boundaries[index + 1] ?? measure.columns.length
    const columns = measure.columns.slice(start, stop)
    return { columns, left: Math.min(...columns.map(column => column.minimumStart!)), right: Math.max(...columns.map(column => column.minimumEnd!)) }
  })
  const candidates: NativeLineCandidate[][] = Array.from({ length: groups.length }, () => [])
  for (let start = 0; start < groups.length; start++) {
    let right = -Infinity
    const beat = groups[start]!.columns[0]!.time - measure.columns[0]!.time
    const offBeat = start > 0 && Math.abs(beat - Math.round(beat)) > 1e-7
    for (let stop = start; stop < groups.length; stop++) {
      right = Math.max(right, groups[stop]!.right)
      const occupied = right - groups[start]!.left
      if (occupied > capacity && stop > start) break
      candidates[start]!.push({ end: stop + 1, density: occupied / capacity, penalty: offBeat ? 1 : 0 })
    }
  }
  const fragments: typeof measure.columns[] = []
  let start = 0
  for (const stop of planNativeLines(candidates)) {
    fragments.push(groups.slice(start, stop).flatMap(group => group.columns)); start = stop
  }
  if (fragments.length < 2) return [measure]
  return fragments.map((columns, index) => {
    const first = columns[0]!, last = columns.at(-1)!
    return { ...measure, columns, continuation: index > 0, lastFragment: index === fragments.length - 1,
      // A split bar owns its rows. Do not attach a short following bar to its
      // final fragment and shift the rest of the score's global line plan.
      breakBefore: true, breakAfter: true,
      coreGapBefore: index === 0 ? measure.coreGapBefore : undefined,
      naturalStart: first.naturalStart, naturalEnd: last.naturalEnd,
      minimumStart: first.minimumStart!, minimumEnd: last.minimumEnd!, minimum: last.minimumEnd! - first.minimumStart! }
  })
}
