import { createHash } from 'node:crypto'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance } from '@m3n/notation'

/** Musical content and timing, independent of source offsets and layout. */
export function scoreContract(source: string) {
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  const interaction = deriveScoreInteraction(document)
  const identities = scoreEventIds(document)
  const lyrics = new Map([...identities].map(([event, id]) => [id, interaction.lyricsByEvent.get(event) ?? []]))
  const performedLyrics = performance.elements.flatMap(element => (lyrics.get(element.xmlId) ?? [])
    .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
    .map(lyric => [element.voice, element.start, element.end, element.tupletSlot, lyric.text]))
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [pitches.get(event), event.beats, event.tie, event.postfixes, event.dynamic, event.tempo, event.key, event.meterCount, event.meterUnit]))
  const written = [...document.parts].map(([name, part]) => [name, ...[part.melody, part.bass].map(measures => measures.map(bar => ({
    left: bar.left, right: bar.right, ending: bar.ending, navigation: bar.navigation, section: bar.sectionName,
    interlude: bar.interlude, events: bar.events.map(event => [event.kind, event.pitches, event.beats, event.tie, event.postfixes, event.key, event.tempo, event.navigation]),
  })))])
  const offsets = new Map([...identities].map(([event, id]) => [event.sourceStart, id]))
  const anchor = (offset: number | undefined) => offset === undefined ? undefined : offsets.get(offset)
  const intervals = document.intervals.map(interval => ({ ...interval, start: anchor(interval.start), endStart: anchor(interval.endStart), end: undefined }))
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return {
    beats: performance.beats, notes: performance.notes.length, events: events.length, lyrics: performedLyrics.length,
    music: hash({ notes: performance.notes, tempos: performance.tempos, events }), lyricsHash: hash(performedLyrics),
    notation: hash({ written, intervals, order: document.order }),
  }
}
