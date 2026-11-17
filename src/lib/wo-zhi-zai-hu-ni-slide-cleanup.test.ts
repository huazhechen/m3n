import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/wo_zhi_zai_hu_ni_01.m3n?raw'
import beforeCleanup from './fixtures/wo-zhi-zai-hu-ni-before-slide-cleanup.m3n?raw'

it('merges only 以 and 情 passing notes on all three visits, preserving lyrics and navigation', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const before = parseM3NDocument(beforeCleanup), after = parseM3NDocument(source)
  const original = compileScorePerformance(before), actual = compileScorePerformance(after)
  const removedStarts = new Set([65.75, 147.75, 197.75, 79.75, 161.75, 211.75])
  const extendedEnds = new Map([
    [65.5, 66], [147.5, 148], [197.5, 198],
    [79.25, 80], [161.25, 162], [211.25, 212],
  ])
  expect(actual.notes.map(note => [note.start, note.end, note.pitch, note.channel])).toEqual(
    original.notes.filter(note => !removedStarts.has(note.start))
      .map(note => [note.start, extendedEnds.get(note.start) ?? note.end, note.pitch, note.channel]),
  )
  expect(original.notes.length - actual.notes.length).toBe(6)
  expect(actual.beats).toBe(214)
  const originalBars = before.parts.get('score')!.melody, actualBars = after.parts.get('score')!.melody
  expect(playbackMeasureIndexes(actualBars)).toEqual(playbackMeasureIndexes(originalBars))
  expect(actualBars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
    .toEqual(originalBars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
  const lyrics = (document: typeof before) => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    return compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => [element.start, element.end, lyric.text] as const))
  }
  expect(lyrics(after)).toEqual(lyrics(before).map(([start, end, text]) => [
    start, extendedEnds.get(start) ?? end, text,
  ]))
})
