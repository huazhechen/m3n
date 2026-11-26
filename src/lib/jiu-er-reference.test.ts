import { compileScorePerformance, parseM3NDocument, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/jiu_er_01.m3n?raw'
import reference from './fixtures/jiu-er-kuaiyuepu.json'

it('preserves the arrangement while applying the uploaded core melody ties within the harmonica range', () => {
  const document = parseM3NDocument(source)
  expect(validateM3NDiagnostics(source)).toEqual([])
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(96)
  const pitches = performance.notes.map(note => note.pitch)
  expect([Math.min(...pitches), Math.max(...pitches)]).toEqual([63, 86])
  expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(24)
  // 876f8e578231bd05047dab26a00e1914.png: the 7 across 花's barline and the
  // two 5s on 天 are tied. The reference specifies both ties.
  const removedAttacks = new Set([12, 44, 21, 53, 77])
  const tiedEnds = new Map([[11.75, 12.5], [43.75, 44.5], [20.5, 23], [52.5, 55], [76.5, 79]])
  const expected = reference.notes.filter(([start]) => !removedAttacks.has(start!))
    .map(([start, end, pitch]) => [start, tiedEnds.get(start!) ?? end, pitch! + reference.transposeSemitones])
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(expected)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})
