import { expect, it } from 'vitest'
import beforeCleanup from './fixtures/reasons-before-slide-cleanup.m3n?raw'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/yi_qian_ge_shang_xin_de_li_you_01.m3n?raw'

it('writes the third chorus in sequence and preserves the complete performance duration', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody
  // The first two visits retain their repeats; the third chorus and coda run straight through.
  const baseline = [
    1,2,3,4,5,6,7,8,1,2,3,4,5,6,9,10,11,12,13,14,15,16,17,18,19,20,21,22,
    1,2,3,4,5,6,7,8,1,2,3,4,5,6,9,10,11,12,13,14,15,16,17,23,24,
    25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,
  ]
  expect(playbackMeasureIndexes(bars).map(index => index + 1)).toEqual(baseline)
  expect(compileScorePerformance(document).beats).toBe(268)
  expect([bars[31]!.events[0]!.pitches, bars[32]!.events[0]!.pitches]).toEqual([['1'], ['1']])
  const lastNote = compileScorePerformance(document).notes.filter(note => note.channel === 0).at(-1)!
  expect(lastNote.end).toBe(268)
})

it('reuses the complete chorus lyrics on every visit', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(source).not.toMatch(/\{(?:segno|ds)\}/)
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)]
    .map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const elements = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
  const text = (start: number, end: number) => elements.filter(element => start <= element.start && element.start < end)
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => lyric.text)).join('')
  expect(text(64, 92)).toBe('伤心的理由一千个伤心的理由最后我的爱情在故事里慢慢陈旧一千个伤心的理由一千个伤心的理由最后在别人的故事里我')
  expect(text(176, 204)).toBe(text(64, 92))
  expect(text(212, 240)).toBe(text(64, 92))
})


it('preserves passing-note cleanup and lyric onsets while lowering the coda tonic', () => {
  const before = parseM3NDocument(beforeCleanup), after = parseM3NDocument(source)
  const original = compileScorePerformance(before), actual = compileScorePerformance(after)
  // 心 is played four times, 陈 three times, and this first-ending 遗 once.
  const extendedEnds = new Map([
    [12.5, 13], [44.5, 45], [124.5, 125], [156.5, 157],
    [77.5, 78], [189.5, 190], [225.5, 226], [95, 96],
  ])
  const removedStarts = new Set([12.75, 44.75, 124.75, 156.75, 77.75, 189.75, 225.75, 95.75])
  const expected = original.notes.filter(note => !removedStarts.has(note.start))
    .map(note => [note.start, extendedEnds.get(note.start) ?? note.end, note.start === 240 ? note.pitch - 12 : note.pitch, note.channel])
  expect(actual.notes.map(note => [note.start, note.end, note.pitch, note.channel])).toEqual(expected)
  expect(original.notes.length - actual.notes.length).toBe(8)
  expect(actual.beats).toBe(original.beats)

  const lyrics = (document: typeof before) => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    return compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => [element.start, lyric.text]))
  }
  const previousLyrics = lyrics(before)
  const expectedLyrics = [
    ...previousLyrics.filter(([start]) => Number(start) < 176),
    ...previousLyrics.filter(([start]) => Number(start) >= 64 && Number(start) < 92)
      .map(([start, text]) => [Number(start) + 112, text]),
    ...previousLyrics.filter(([start]) => Number(start) >= 204 && Number(start) < 212),
    ...previousLyrics.filter(([start]) => Number(start) >= 64 && Number(start) < 92)
      .map(([start, text]) => [Number(start) + 148, text]),
    ...previousLyrics.filter(([start]) => Number(start) >= 240),
  ]
  expect(lyrics(after)).toEqual(expectedLyrics)
})
