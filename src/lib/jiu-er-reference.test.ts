import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, sectionOrderLabels, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/jiu_er_01.m3n?raw'
import reference from './fixtures/jiu-er-kuaiyuepu.json'
import { loadPresetScore, presetScores } from './samples'

it('loads Jiu Er with shared phrases in B-flat, C and F', async () => {
  const preset = presetScores.find(score => score.sourcePath === 'jiu_er_01.m3n')!
  expect(preset.title).toBe('九儿')
  expect(await loadPresetScore(preset.slug)).toBe(source)
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['Bb', 4, 4, 60])
  expect(document.order).toEqual(['Intro', 'A', 'B', 'A', 'B', 'Bridge', 'B', 'Coda'])
  expect(document.orderKeys).toEqual([undefined, undefined, undefined, 'C', 'C', undefined, 'F', undefined])
  expect(document.orderKeyOctaves).toEqual([undefined, undefined, undefined, 5, 5, undefined, 5, undefined])
  expect(sectionOrderLabels(document)).toEqual(['Intro', 'A（1=B♭）', 'B（1=B♭）', 'A（1=C）', 'B（1=C）', 'Bridge', 'B（1=F）', 'Coda'])
  expect(document.parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(23)
  expect(document.alternatives).toBeUndefined()
  expect(document.parts.get('score')!.melody.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1,2', '3'])
})

it('preserves every reference sounding pitch and duration, including the rising registers', () => {
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(136)
  expect(alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(34)
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(reference.notes)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})

it('retains all vocal lyrics and skips the instrumental introduction', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.flatMap(element => (byId.get(element.xmlId) ?? [])
    .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
    .map(lyric => [element.start, lyric.text] as const))
  expect(lyrics[0]![0]).toBe(32)
  expect(lyrics.map(([, text]) => text).join('')).toBe(reference.lyricText)
})
