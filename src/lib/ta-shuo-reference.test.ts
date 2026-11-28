import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/ta_shuo_01.m3n?raw'
import pitchReference from './fixtures/ta-shuo-pitches.json'

it('preserves the uploaded Ta Shuo vocal line, including its second-verse and final-chorus variants', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.tempo).toBe(86)
  expect(document.order).toBeUndefined()
  const written = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(written).toHaveLength(56)
  expect(written.filter(bar => bar.left === 'rptstart')).toHaveLength(0)
  expect(source).not.toContain('||:')
  expect(document.parts.get('score')!.melody.filter(bar => bar.right === 'rptend')).toHaveLength(1)
  const part = unfoldScorePerformance(document).parts.get('score')!
  const bars = part.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  // PDF vocal bars 10–42 and 52–104, with piano-only sections omitted.
  const index = (pdfBar: number) => pdfBar <= 42 ? pdfBar - 10 : pdfBar - 52 + 33
  const notes = (pdfBar: number) => bars[index(pdfBar)]!.events.map(event => [pitches.get(event)?.[0] ?? 'rest', event.beats])
  expect(bars).toHaveLength(86)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(86).fill(4))
  expect(compileScorePerformance(document).beats).toBe(344)
  expect(part.bass.flatMap(bar => bar.events)).toEqual([])
  expect(bars.flatMap(bar => bar.events).every(event => event.pitches.length <= 1)).toBe(true)
  expect(notes(10)).toEqual([['rest', 1], ['c:5:', .5], ['c:5:', .5], ['b:4:', .5], ['b:4:', .5], ['g:4:', .5], ['c:4:', .5]])
  expect(notes(13)[0]).toEqual(['g:4:', 3])
  expect(notes(55)).toEqual([['g:4:', 3], ['d:5:', .5], ['c:5:', .5]])
  expect(notes(30).slice(0, 3)).toEqual([['e:5:', .25], ['d:5:', .25], ['c:5:', 1.5]])
  expect(notes(80)[0]).toEqual(['e:5:', 1])
  expect(notes(96)[0]).toEqual(['a:5:', 1])
  expect(bars[index(99)]!.events.at(-1)!.tie).toBe(true)
  expect(bars[index(102)]!.events.at(-1)!.tie).toBe(true)
  expect(notes(104)).toEqual([['c:5:', 4]])
  const text = performedWords(document)
  const verse = '他静悄悄地来过他慢慢带走沉默只是最后的承诺还是没有带走了寂寞我们爱的没有错只是美丽的独秀太折磨她说无所谓只要能在夜里翻来覆去的时候有寄托'
  const chorus = '等不到天黑烟火不会太完美回忆烧成灰还是等不到结尾她曾说的无所谓我怕一天一天被摧毁等不到天黑不敢凋谢的花蕾绿叶在跟随放开刺痛的滋味今后不再怕天明我想只是害怕清醒'
  expect(text).toBe(verse + chorus + verse + chorus + chorus + '不怕天明我想只是害怕清醒')
  const writtenLyrics = deriveScoreInteraction(document).lyricsByEvent
  expect(written[51]!.events.map(event => (writtenLyrics.get(event) ?? []).filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')))
    .toEqual(['', '', '不', '怕'])
})

it('matches every vocal pitch and octave independently read from the uploaded PDF', () => {
  const document = parseM3NDocument(source)
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const degree = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
  expect(bars).toHaveLength(pitchReference.measures.length)
  for (const [index, reference] of pitchReference.measures.entries()) {
    const expected = reference.pitches.split(' ').map(pitch => pitch === '0' ? 'rest' :
      `${degree[Number(pitch[0]) - 1]}:${pitch.endsWith('e') ? 5 : 4}:`)
    expect(bars[index]!.events.map(event => pitches.get(event)?.[0] ?? 'rest'),
      `PDF measure ${reference.pdfMeasure}, vocal measure ${index + 1}`).toEqual(expected)
  }
})

it('encloses every lyric syllable spanning different pitches in a complete slur', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  const lyrics = deriveScoreInteraction(document).lyricsByEvent
  const events = bars.flatMap(bar => bar.events)
  const groups: { word: string; events: typeof events }[] = []
  let current: (typeof groups)[number] | undefined
  for (const bar of bars) {
    if (bar.interlude) current = undefined
    for (const event of bar.events) {
      if (!pitches.get(event)?.length) { current = undefined; continue }
      const word = lyrics.get(event)?.find(lyric => lyric.kind === 'text')?.text
      if (word) { current = { word, events: [] }; groups.push(current) }
      current?.events.push(event)
    }
  }
  const melismas = groups.filter(group => new Set(group.events.map(event => pitches.get(event)![0])).size > 1)
  expect(melismas.map(group => group.word)).toEqual(['默', '尾', '毁', '尾', '毁'])
  const slurs = document.intervals.filter(interval => interval.kind === 'lg')
  expect(slurs).toHaveLength(melismas.length)
  for (const group of melismas) expect(slurs, group.word).toContainEqual(expect.objectContaining({
    start: group.events[0]!.sourceStart, endStart: group.events.at(-1)!.sourceStart,
  }))
})

function performedWords(document: ReturnType<typeof parseM3NDocument>) {
  const lyrics = deriveScoreInteraction(document).lyricsByEvent
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyrics.get(event) ?? []]))
  return compileScorePerformance(document).elements.filter(event => event.voice === 'score:melody').flatMap(event =>
    (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition))).map(lyric => lyric.text),
  ).join('')
}
