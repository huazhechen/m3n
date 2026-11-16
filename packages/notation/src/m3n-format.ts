import { splitAtStrongBeats, mergeRedundantDurations } from './formatting/rhythm.js'
import { normalizeGroups } from './formatting/groups.js'
import { normalizeLayout } from './formatting/layout.js'
import { alignLyrics } from './formatting/lyrics.js'
import type { FormatContext } from './formatting/shared.js'

export { normalizeAdjacentBarlines } from './formatting/layout.js'

/** Formats spelling and layout while preserving musical, structural and lyric meaning. */
export function formatM3N(source: string, context?: FormatContext) {
  const normalized = source.replace(/\r\n?/g, '\n')
  const reusable = normalized === source ? context : undefined
  const simplified = normalizeGroups(normalized, reusable)
  const split = splitAtStrongBeats(simplified, simplified === source ? reusable : undefined)
  // Splitting may introduce scopes; simplify them before inspecting mergeable runs.
  const regrouped = normalizeGroups(split)
  const merged = mergeRedundantDurations(regrouped)
  const grouped = normalizeGroups(merged)
  return alignLyrics(normalizeLayout(grouped))
}
