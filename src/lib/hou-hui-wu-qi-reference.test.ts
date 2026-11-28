import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import source from '../scores/hou_hui_wu_qi_01.m3n?raw'

it('keeps the PDF vocal rhythm, lowered octave, modulation and changed closing meter', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const score = parseM3NDocument(source)
  expect(score).toMatchObject({ title: '后会无期', singer: '邓紫棋', key: 'Bb', meterCount: 6, meterUnit: 8, tempo: 103 })
  expect(score.order).toBeUndefined()
  expect(source).not.toContain('===')
  const bars = score.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(80)
  expect(score.parts.get('score')!.bass.flatMap(bar => bar.events)).toEqual([])
  expect(bars.flatMap(bar => bar.events).every(event => event.pitches.length <= 1)).toBe(true)
  // PDF bars 5, 37, 69 and 83–84; the image has different rhythm/register here.
  expect(bars[0]!.events.map(event => event.beats)).toEqual([1.5, .5, .5, .5])
  expect(bars[0]!.events.map(event => event.tie)).toEqual([true, false, false, false])
  expect(bars[32]!.events.map(event => event.beats)).toEqual([1, .5, 1, .5])
  expect(bars.slice(64).flatMap(bar => bar.events).every(event => event.key === 'B')).toBe(true)
  expect(bars.slice(-2).map(bar => [bar.events[0]!.meterCount, bar.events.reduce((sum, event) => sum + event.beats, 0)]))
    .toEqual([[9, 4.5], [6, 3]])
  expect(bars.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
  expect(bars.filter(bar => bar.right === 'rptend')).toHaveLength(1)
  expect(compileScorePerformance(score).beats).toBe(337.5)
})

it('sings the screenshot lyrics in order, including both chorus verses and the final ending', () => {
  const score = parseM3NDocument(source)
  const lyrics = deriveScoreInteraction(score).lyricsByEvent
  const byId = new Map([...scoreEventIds(score)].map(([event, id]) => [id, lyrics.get(event) ?? []]))
  const sung = compileScorePerformance(score).elements.filter(event => event.voice === 'score:melody')
    .flatMap(event => (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition))).map(lyric => lyric.text)).join('')
  const a = '当一艘船沉入海底当一个人成了谜你不知道他们为何离去那声再见竟是他最后一句'
  const b = '当一辆车消失天际当一个人成了谜你不知道他们为何离去就像你不知道这竟是结局'
  const c1 = '在每个繁星抛弃银河的夜里我会告别告诉我自己因为我不知道我也不想知道和相聚之间的距离'
  const c2 = '在每个银河坠入山谷的梦里我会醒来也忘记梦境因为你不知道你也不会知道逝去的就已经失去'
  expect(sung).toBe(a + b + c1 + b + c2 + a + b)
})

it('lowers every played note one octave and places the final jing after the rests', () => {
  const score = parseM3NDocument(source)
  const notes = compileScorePerformance(score).notes.map(n => [n.start, n.end, n.pitch])
  expect(createHash('sha256').update(JSON.stringify(notes)).digest('hex')).toBe('251ecaa66d181f7926abbbe6e4e02abeb733b12ec2a0dfe2fe1a53d09841a92d')
  const bars = score.parts.get('score')!.melody.filter(bar => bar.events.length)
  const lyrics = deriveScoreInteraction(score).lyricsByEvent
  const text = (event: typeof bars[number]['events'][number]) => (lyrics.get(event) ?? []).filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')
  expect(bars.at(-3)!.events.map(text)).toEqual(['这', ''])
  expect(bars.at(-2)!.events.map(text)).toEqual(['', '', '', '竟', '是', '结'])
  expect(bars.at(-1)!.events.map(text)).toEqual(['', '局', ''])
})
