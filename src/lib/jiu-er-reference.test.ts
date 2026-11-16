import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/jiu_er_01.m3n?raw'
import reference from './fixtures/jiu-er-kuaiyuepu.json'
import { loadPresetScore, presetScores } from './samples'

it('loads Jiu Er fully written out with a subtitle and inline key changes', async () => {
  const preset = presetScores.find(score => score.sourcePath === 'jiu_er_01.m3n')!
  expect(preset.title).toBe('九儿')
  expect(await loadPresetScore(preset.slug)).toBe(source)
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['Bb', 4, 4, reference.tempo])
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
  expect([...new Set(bars.flatMap(bar => bar.events.map(event => event.key)))]).toEqual(['Bb', 'C', 'F'])
})

it('preserves every reference sounding pitch and duration, transposed up one semitone including the rising registers', () => {
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(96)
  expect(alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(24)
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(reference.notes.map(([start, end, pitch]) => [start, end, pitch! + reference.transposeSemitones]))
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})

it('retains all vocal lyrics from the first bar', () => {
  const document = parseM3NDocument(source)
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
