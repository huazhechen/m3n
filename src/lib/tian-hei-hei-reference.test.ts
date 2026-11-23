import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/tian_hei_hei_01.m3n?raw'

// Independently checked against EasyPiano.hk's 天黑黑 P.1 and P.2 images.
// Bar numbers below refer to this linear vocal edition, including its pickup.
// Intro is omitted; instrumental passages retain their duration as rests.
const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const signature = (number: number) => bars[number - 1]!.events.map(event =>
  `${event.pitches.join(',') || '0'}:${event.beats}${event.tie ? '~' : ''}`).join(' ')

describe('Tian Hei Hei, EasyPiano reference', () => {
  it('keeps a one-beat vocal pickup, complete middle bars and a complementary ending', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ key: 'Ab', meterCount: 4, meterUnit: 4, tempo: 112 })
    expect(bars).toHaveLength(92)
    expect(signature(1)).toBe('3:0.5 4:0.5')
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual([1, ...Array<number>(90).fill(4), 3])
    expect(compileScorePerformance(document).beats).toBe(364)
  })

  it('preserves the printed verse rests, low fifths and short phrase endings', () => {
    for (const number of [3, 7, 17, 21, 72]) {
      expect(signature(number)).toBe('5:0.5 6:0.5 4:0.5 3:0.5 4:0.5 0:0.5 2:0.5 3:0.5')
    }
    for (const number of [5, 19, 74]) {
      expect(signature(number)).toBe('3:1 5d:1 0:1 3:0.5 4:0.5')
    }
    for (const number of [9, 23]) expect(signature(number)).toBe('2:1 1:1 0:1 0:1')
  })

  it('corrects every chorus return, including the seventh, sixth and rest after 撞', () => {
    for (const number of [30, 32, 38, 40, 54, 56, 62, 64]) {
      expect(signature(number)).toBe('7:0.5 1e:0.5 2e:0.5 1e:0.5 7:0.5 5:0.5 3:0.5 2:0.5')
    }
    for (const number of [33, 57]) expect(signature(number)).toBe('3:1 6:1 0:0.5 5:0.5 5:0.5 6:0.5')
    for (const number of [34, 58]) expect(signature(number)).toBe('1e:1 6:0.5 1e:0.5 0:1 1e:0.5 6:0.5')
    for (const number of [42, 66]) {
      expect(signature(number)).toBe('1e:0.5 6:0.5 1e:0.5 0:0.5 1e:0.5 6:0.5 1e:0.5 6:0.5')
    }
    for (const number of [43, 67]) expect(signature(number)).toBe('1e:1 6:0.5 1e:0.5 0:0.5 5:0.5 5:0.5 6:0.5')
    for (const number of [44, 68]) {
      expect(signature(number)).toBe('2e:0.5 1e:0.5 2e:0.5 1e:0.5 2e:0.5 1e:0.5~ 1e:0.5 0:0.5')
    }
    expect(Array.from({ length: 16 }, (_, index) => signature(30 + index)))
      .toEqual(Array.from({ length: 16 }, (_, index) => signature(54 + index)))
  })

  it('follows page two for the third verse and tied folk refrain', () => {
    expect(signature(75)).toBe('5:0.5 5:0.5~ 5:0.5 5:0.5 1e:0.5 5:0.5~ 5:0.5 6:0.5')
    expect(signature(76)).toBe('5:0.5 4:0.5 4:0.5 3:0.5 4:0.5 0:0.5 2:0.5 3:0.5')
    for (const number of [78, 80]) expect(signature(number)).toBe('2:1 1:1 0:1 2:0.5 3:0.5')
    expect(signature(82)).toBe('1:1 0:1 0:1 0:1')
    for (const number of [25, 84]) {
      expect(signature(number)).toBe('5:1 1:1 3b:2~')
      expect(signature(number + 1)).toBe('3b:1 0:1 0:1 0:1')
    }
  })

  it('aligns corrected notes and rests with their intended syllables', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const lyrics = (number: number) => bars[number - 1]!.events.map(event =>
      (lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join(''))
    expect(lyrics(3)).toEqual(['任', '性', '的', '时', '候', '', '我', '的'])
    expect(lyrics(5)).toEqual(['哄', '我', '', '夏', '天'])
    expect(lyrics(30)).toEqual(['让', '我', '奋', '不', '顾', '身', '的', '一'])
    expect(lyrics(34)).toEqual(['冲', '直', '撞', '', '被', '误'])
    expect(lyrics(44)).toEqual(['大', '却', '看', '不', '清', '楚', '', ''])
    expect(lyrics(75)).toEqual(['外', '婆', '', '的', '道', '理', '', '早'])
    expect(lyrics(76)).toEqual(['就', '唱', '给', '我', '听', '', '下', '起'])
  })

  it('silences the full instrumental interlude and outro without deleting their time', () => {
    expect(source).not.toContain('{inst}')
    for (const number of [12, 46, 47, 48, 49, 50, 51, 52, 88, 89, 90, 91]) {
      expect(signature(number)).toBe('0:4')
    }
    expect(signature(15)).toBe('0:3 3:0.5 4:0.5')
    expect(signature(53)).toBe('0:2 0:0.5 5:0.5 2e:0.5 1e:0.5')
    expect(signature(70)).toBe('0:3 3:0.5 4:0.5')
    expect(signature(92)).toBe('0:3')
  })
})
