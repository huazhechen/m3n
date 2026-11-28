import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/xi_huan_ni_01.m3n?raw'

// Read independently from the uploaded 8ee9b92473a4c2a7dd94faf94ac2dc7e.jpeg.
// Concert pitches and quarter-note durations for the fourteen shared chorus bars.
const chorus = [
  'E5/1 A4/.5 A4/.5 E5/.5 C5/.5',
  'D5/1.5 B4/.5 C5/.5 D5/.5',
  'D5/1 G4/.5 G4/1 G4/.5',
  'D5/1 C5/.5 C5/.5 B4/.5 C5/.5',
  'F4/1.5 C5/.5 B4/.5 C5/.5',
  'D5/1.5 G4/.5 C5/.5 D5/.5',
  'F5/.5 E5/.5 D5/.5 F5/.5 E5/.5 D5/.5',
  'E5/1.5 E5/.5 D5/.5 C5/.5',
  'E5/1 A5/.5 A5/.5 E5/.5 C5/.5',
  'D5/1.5 B4/.5 C5/.5 D5/.5',
  'D5/1 G5/.5 F5/.5 E5/.5 D5/.5',
  'C5/1.5 A4/.5 B4/.5 C5/.5',
  'F4/1.5 B4/.5 C5/.5 D5/.5',
  'E5/.5 D5/.25 C5/.75 B4/.5 C5/.5 D5/.5',
].map(row => row.split(' ').map(token => {
  const [pitch, beats] = token.split('/')
  return { pitch, beats: Number(beats) }
}))

it('preserves the photographed chorus pitches, octaves and compound-meter rhythm', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: '喜欢你', singer: '陈洁仪', composer: '梁文福', lyricist: '梁文福', key: 'C', meterCount: 6, meterUnit: 8 })
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const actual = bars.slice(33, 47).map(bar => bar.events.map(event => {
    const [letter, octave] = pitches.get(event)![0]!.split(':')
    return { pitch: `${letter!.toUpperCase()}${octave}`, beats: event.beats }
  }))
  expect(actual).toEqual(chorus)
  expect(bars[46]!.events.at(-1)).toMatchObject({ pitches: ['2e'], beats: 0.5, tie: true })
  expect(bars[47]!.events[0]).toMatchObject({ pitches: ['2e'], beats: 0.5 })
  expect(bars[0]!.events.map(event => event.beats)).toEqual([1.5, 1, 0.5])
  expect(source).toContain('1e~ 1e. {fine} |')
  expect(source).not.toMatch(/\{(?:tocoda|coda)\}/)
})

it('returns to the photographed repeat at the car-window verse and reuses the first lyrics', () => {
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = performance.elements.filter(element => element.voice === 'score:melody').flatMap(element =>
    (byId.get(element.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition))).map(lyric => lyric.text),
  ).join('')
  const verseTail = '喜欢你车窗上的雾气仿佛是你的爱在呼吸喜欢你那微笑的眼睛连日落也看作唇印我喜欢'
  const chorusTail = '你的脸慢慢贴近明天也慢慢地慢慢清晰我喜欢你爱我的心轻触我每根手指感应我知道它在诉说着你承诺言语'
  const chorus1 = `这样跟着你随便你带我到哪里${chorusTail}`
  expect(lyrics).toBe(
    `喜欢你给我你的外衣让我像躲在你身体里喜欢你借我你的梳子让我用柔软头发吻你${verseTail}${chorus1}` +
    `${verseTail}${chorus1}我喜欢${chorus1}`,
  )
  expect(source).not.toMatch(/^L\d+:/m)
  expect(source.match(/^---V[12]$/gm)).toHaveLength(2)
  expect(source).not.toContain('N: 3e 1e (6~ 6)')
  expect(document.parts.get('score')!.melody.filter(bar => bar.events.length).findIndex(bar => bar.left === 'rptstart')).toBe(17)
  expect(performance.beats).toBe(288)
  expect(performance.notes[0]).toMatchObject({ start: 1.5, pitch: 64 })
  expect(document.intervals.some(interval => interval.kind === 'inst')).toBe(false)
  expect(document.parts.get('score')!.melody.flatMap(bar => bar.events).filter(event => event.kind === 'rest').every(event => event.beats <= 1.5)).toBe(true)
})
