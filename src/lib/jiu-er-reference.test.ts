import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/jiu_er_01.m3n?raw'
import vocalSource from './fixtures/jiu-er-before-instrumental.m3n?raw'
import reference from './fixtures/jiu-er-kuaiyuepu.json'
import { loadPresetScore, presetScores } from './samples'

it('loads Jiu Er fully written out with a subtitle and inline key changes', async () => {
  const preset = presetScores.find(score => score.sourcePath === 'jiu_er_01.m3n')!
  expect(preset.title).toBe('九儿')
  expect(await loadPresetScore(preset.slug)).toBe(source)
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['Eb', 4, 4, reference.tempo])
  expect(document.subtitle).toBe('电视剧《红高粱》片尾曲')
  expect(document.origin).toBe('')
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(24)
  expect(document.alternatives).toBeUndefined()
  expect(bars.slice(0, -1).every(bar => bar.right === 'single')).toBe(true)
  expect(bars.at(-1)!.right).toBe('end')
  expect(bars.every(bar => !bar.ending && bar.left !== 'rptstart' && bar.right !== 'rptend')).toBe(true)
  expect([...new Set(bars.flatMap(bar => bar.events.map(event => event.key)))]).toEqual(['Eb', 'F', 'Bb'])
})

it('preserves the arrangement while applying the uploaded core melody ties within the harmonica range', () => {
  const document = parseM3NDocument(source)
  expect(validateM3NDiagnostics(source)).toEqual([])
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(96)
  const pitches = performance.notes.map(note => note.pitch)
  expect([Math.min(...pitches), Math.max(...pitches)]).toEqual([63, 86])
  expect(alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(24)
  // 876f8e578231bd05047dab26a00e1914.png: the 7 across 花's barline and the
  // two 5s on 天 are tied. Keep the historical web reference and arrangement.
  const removedAttacks = new Set([12, 44, 21, 53, 77])
  const tiedEnds = new Map([[11.75, 12.5], [43.75, 44.5], [20.5, 23], [52.5, 55], [76.5, 79]])
  const expected = reference.notes.filter(([start]) => !removedAttacks.has(start!))
    .map(([start, end, pitch]) => [start, tiedEnds.get(start!) ?? end, pitch! + reference.transposeSemitones])
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(expected)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})

it('retains the historical vocal reference from the first bar', () => {
  const document = parseM3NDocument(vocalSource)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.flatMap(element => (byId.get(element.xmlId) ?? [])
    .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
    .map(lyric => [element.start, element.end, lyric.text] as const))
  expect(lyrics).toHaveLength(87)
  for (const start of [23, 55, 79, 87]) {
    const index = lyrics.findIndex(([beat, , text]) => beat === start && text === '九')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(lyrics.slice(index, index + 8).map(([beat, , text]) => [beat, text])).toEqual([
      [start, '九'], [start + .5, '儿'], [start + 1, '我'], [start + 2.5, '送'],
      [start + 3, '你'], [start + 3.5, '去'], [start + 4, '远'], [start + 5, '方'],
    ])
  }
  expect(lyrics[0]![0]).toBe(0)
  expect(lyrics.map(([, , text]) => text).join('')).toBe(reference.lyricText)
})


it('removes lyrics while preserving the vocal arrangement and all key changes', () => {
  const document = parseM3NDocument(source)
  expect([...deriveScoreInteraction(document).lyricsByEvent.values()].flat()).toEqual([])
  expect(compileScorePerformance(document).notes).toEqual(compileScorePerformance(parseM3NDocument(vocalSource)).notes)
  expect(source).toBe(vocalSource.replace(/^L:.*\n/gm, ''))
})

it('keeps both cross-bar slurs through the tied 7 after removing lyrics', () => {
  const document = parseM3NDocument(source), vocal = parseM3NDocument(vocalSource)
  const { lyricsByEvent } = deriveScoreInteraction(vocal)
  const previous = vocal.parts.get('score')!.melody.flatMap(bar => bar.events)
  const events = document.parts.get('score')!.melody.flatMap(bar => bar.events)
  const referenceSlurs = vocal.intervals.filter(interval => interval.kind === 'lg' &&
    previous.some(event => event.sourceStart === interval.start &&
      lyricsByEvent.get(event)?.some(lyric => lyric.kind === 'text' && lyric.text === '儿')))
  expect(referenceSlurs).toHaveLength(2)
  for (const reference of referenceSlurs) {
    const start = previous.findIndex(event => event.sourceStart === reference.start)
    const slur = document.intervals.find(interval => interval.kind === 'lg' && interval.start === events[start]!.sourceStart)!
    expect(slur).toBeDefined()
    expect(slur.endStart).toBe(events[start + 2]!.sourceStart)
    expect(events[start + 1]!.pitches).toEqual(['7'])
    expect(events[start + 1]!.tie).toBe(true)
    expect(events[start + 2]!.pitches).toEqual(['7'])
  }
})
