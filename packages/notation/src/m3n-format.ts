import { normalizeGroups } from './formatting/groups.js'
import { normalizeLayout } from './formatting/layout.js'
import { normalizeSectionBarlines } from './formatting/barlines.js'
import { alignLyrics } from './formatting/lyrics.js'
import type { FormatContext } from './formatting/shared.js'

export { normalizeSectionBarlines } from './formatting/barlines.js'
export { normalizeAdjacentBarlines } from './formatting/layout.js'

/** Formats equivalent spelling and layout without splitting or merging engraved events. */
export function formatM3N(source: string, context?: FormatContext) {
  const normalized = source.replace(/\r\n?/g, '\n')
  const reusable = normalized === source ? context : undefined
  const grouped = normalizeGroups(normalized, reusable)
  return alignLyrics(normalizeSectionBarlines(normalizeLayout(grouped)))
}
