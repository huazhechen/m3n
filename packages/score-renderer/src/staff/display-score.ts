import { deriveScoreInteraction, scoreEventIds, unfoldScorePerformance, type ScoreDocument, type ScoreEvent, type ScoreEventLyric } from '@m3n/notation'

export function needsStaffExpansion(score: ScoreDocument) {
  return Boolean(score.orderKeys?.some(Boolean) || score.orderKeyOctaves?.some(octave => octave !== undefined && octave !== 4))
}

/** Absolute notation prints keyed visits separately, with the same performed IDs. */
export function staffDisplayScore(score: ScoreDocument) {
  const { lyricsByEvent } = deriveScoreInteraction(score)
  const octaveOffsets = new Map<ScoreEvent, number>()
  if (!needsStaffExpansion(score)) return { score, lyricsByEvent, octaveOffsets }
  const originals = new Map([...scoreEventIds(score)].map(([event, id]) => [id, event]))
  const expanded = unfoldScorePerformance(score)
  const displayedLyrics = new Map<ScoreEvent, ScoreEventLyric[]>()
  for (const part of expanded.parts.values()) for (const staff of [part.melody, part.bass]) for (const measure of staff) for (const event of measure.events) {
    const id = event.playbackId!
    const pass = Number(/-rend(\d+)$/.exec(id)?.[1] ?? 1)
    const original = originals.get(id.replace(/-rend\d+$/, ''))!
    octaveOffsets.set(event, event.octaveShift - original.octaveShift)
    const candidates = (lyricsByEvent.get(original) ?? []).filter(lyric => !lyric.passes || lyric.passes.has(pass))
    const row = Math.min(...candidates.map(lyric => lyric.verseIndex))
    displayedLyrics.set(event, candidates.filter(lyric => lyric.verseIndex === row).map(lyric => ({ ...lyric, n: '1', verseIndex: 1 })))
  }
  return { score: expanded, lyricsByEvent: displayedLyrics, octaveOffsets }
}
