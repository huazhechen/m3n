import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
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

it('repeats the first chorus lyrics on the third visit while retaining the silent second visit', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  const start = source.indexOf('{segno}')
  const end = source.indexOf('N: (0) (0 (3 4))', start)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const targets = new Map([...scoreEventIds(document)]
    .filter(([event]) => start <= event.sourceStart && event.sourceStart < end)
    .map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const elements = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
  const text = (pass: number) => elements.filter(element => element.rendition === pass)
    .flatMap(element => (targets.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(pass)))
      .map(lyric => lyric.text)).join('')
  expect(text(1)).toBe('伤心的理由一千个伤心的理由')
  expect(text(2)).toBe('')
  expect(text(3)).toBe(text(1))
})
