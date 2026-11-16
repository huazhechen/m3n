import type { NativeMeasure } from './native-model.js'

/** Split a dense bar into balanced musical groups, preserving every tuplet. */
export function splitNativeMeasure(measure: NativeMeasure, width: number, pairedSpacing: boolean): NativeMeasure[] {
  const capacity = width * (pairedSpacing ? 1 : 0.94)
  if ((pairedSpacing ? measure.minimum : measure.natural) <= capacity || measure.columns.length < 2) return [measure]
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
    return { columns, left: Math.min(...columns.map(column => column[pairedSpacing ? 'minimumStart' : 'naturalStart']!)), right: Math.max(...columns.map(column => column[pairedSpacing ? 'minimumEnd' : 'naturalEnd']!)) }
  })
  const costs = Array<number>(groups.length + 1).fill(Infinity), previous = Array<number>(groups.length + 1).fill(0)
  costs[0] = 0
  for (let stop = 1; stop <= groups.length; stop++) {
    let right = -Infinity
    for (let start = stop - 1; start >= 0; start--) {
      right = Math.max(right, groups[start]!.right)
      const occupied = right - groups[start]!.left
      if (occupied > capacity && start < stop - 1) break
      const slack = Math.max(0, capacity - occupied) / width
      const beat = groups[start]!.columns[0]!.time - measure.columns[0]!.time
      const offBeat = start > 0 && Math.abs(beat - Math.round(beat)) > 1e-7
      // One line costs one unit. Off-beat starts cost another; the squared
      // slack balances the whole bar instead of leaving a sparse final row.
      const overflow = Math.max(0, occupied - width) / width
      const cost = costs[start]! + 1 + slack * slack + (offBeat ? 1 : 0) + overflow * overflow * 100
      if (cost < costs[stop]!) { costs[stop] = cost; previous[stop] = start }
    }
  }
  const fragments: typeof measure.columns[] = []
  for (let stop = groups.length; stop > 0;) {
    const start = previous[stop]!
    fragments.unshift(groups.slice(start, stop).flatMap(group => group.columns)); stop = start
  }
  if (fragments.length < 2) return [measure]
  return fragments.map((columns, index) => {
    const first = columns[0]!, last = columns.at(-1)!
    return { ...measure, columns, continuation: index > 0, lastFragment: index === fragments.length - 1,
      // A split bar owns its rows. Do not attach a short following bar to its
      // final fragment and shift the rest of the score's global line plan.
      breakBefore: true, breakAfter: true,
      extraGap: index === 0 ? measure.extraGap : 0,
      naturalStart: first.naturalStart!, naturalEnd: last.naturalEnd!, natural: last.naturalEnd! - first.naturalStart!,
      minimumStart: first.minimumStart!, minimumEnd: last.minimumEnd!, minimum: last.minimumEnd! - first.minimumStart! }
  })
}
