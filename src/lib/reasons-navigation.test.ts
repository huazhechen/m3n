import { expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument, playbackMeasureIndexes } from '@m3n/notation'
import source from '../scores/yi_qian_ge_shang_xin_de_li_you_01.m3n?raw'

it('preserves the pre-fb318bb itinerary, including the entire ordinary coda after D.S.', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody
  // Captured using repeats.ts from fb318bb^ against the unchanged score source.
  const baseline = [
    1,2,3,4,5,6,7,8,1,2,3,4,5,6,9,10,11,12,13,14,15,16,17,18,19,20,21,22,
    1,2,3,4,5,6,7,8,1,2,3,4,5,6,9,10,11,12,13,14,15,16,17,23,24,
    11,12,13,14,15,16,17,25,26,27,28,29,30,31,32,
  ]
  expect(playbackMeasureIndexes(bars).map(index => index + 1)).toEqual(baseline)
  expect(compileScorePerformance(document).beats).toBe(268)
  const lastNote = compileScorePerformance(document).notes.filter(note => note.channel === 0).at(-1)!
  expect(lastNote.end).toBe(268)
})
