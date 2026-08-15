import { describe, expect, it } from 'vitest'
import { analyzeM3N } from './notation/analysis.js'
import { jianpuKeyNumber, m3nPitchToMidi, toJianpuScoreData } from './m3n-jianpu.js'

function convert(source: string) {
  const analysis = analyzeM3N(source)
  return toJianpuScoreData(analysis.score, analysis.conversion.mei)
}

describe('m3nPitchToMidi / jianpuKeyNumber', () => {
  it('maps C-major scale degrees to MIDI pitches', () => {
    expect(m3nPitchToMidi('1', 'C')).toBe(60)
    expect(m3nPitchToMidi('3', 'C')).toBe(64)
    expect(m3nPitchToMidi('7', 'C')).toBe(71)
    expect(m3nPitchToMidi('1e', 'C')).toBe(72)
    expect(m3nPitchToMidi('5d', 'C')).toBe(55)
  })

  it('respects accidentals and octave shifts', () => {
    expect(m3nPitchToMidi('4#', 'C')).toBe(66)
    expect(m3nPitchToMidi('7b', 'C')).toBe(70)
    expect(m3nPitchToMidi('1', 'C', 1)).toBe(72)
    expect(m3nPitchToMidi('1', 'C', -1)).toBe(48)
  })

  it('maps M3N keys to tonic pitch classes', () => {
    expect(jianpuKeyNumber('C')).toBe(0)
    expect(jianpuKeyNumber('G')).toBe(7)
    expect(jianpuKeyNumber('F')).toBe(5)
    expect(jianpuKeyNumber('Am')).toBe(9)
    expect(jianpuKeyNumber('Bb')).toBe(10)
  })
})

describe('toJianpuScoreData', () => {
  it('converts a simple melody with pitches, timing and measures', () => {
    const data = convert('{key=C} {4/4} {120qpm}\nN: 1 2 3 4 | 5 6 7 1e |||')
    expect(data.measures.map((measure) => measure.xmlId)).toEqual(['m3n-measure-1-1', 'm3n-measure-1-2'])
    expect(data.notes).toHaveLength(8)
    expect(data.notes.map((note) => note.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(data.notes.map((note) => note.pitch)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
    expect(data.notes.map((note) => note.xmlId)).toEqual([
      'm3n-e-1', 'm3n-e-2', 'm3n-e-3', 'm3n-e-4', 'm3n-e-5', 'm3n-e-6', 'm3n-e-7', 'm3n-e-8',
    ])
    expect(data.layoutTimeSignatures).toEqual([
      { start: 0, numerator: 4, denominator: 4 },
      { start: 4, numerator: 4, denominator: 4 },
    ])
    expect(data.timeSignatures).toEqual([{ start: 0, numerator: 4, denominator: 4 }])
    expect(data.tempos).toEqual([{ start: 0, qpm: 120 }])
    expect(data.keySignatures).toEqual([{ start: 0, key: 0 }])
    expect(data.measures[0]).toMatchObject({ number: 1, start: 0, length: 4, meterCount: 4, meterUnit: 4 })
  })

  it('keeps rests as gaps between sounding notes', () => {
    const data = convert('{key=C} {4/4}\nN: 1 0 3 0 |||')
    expect(data.notes.map((note) => note.start)).toEqual([0, 2])
    expect(data.notes.map((note) => note.pitch)).toEqual([60, 64])
  })

  it('merges tied notes across a barline into one sounding note', () => {
    const data = convert('{key=C} {4/4}\nN: 1 2 3~ | 3 4 5 6 |||')
    expect(data.notes).toHaveLength(6)
    const tied = data.notes.find((note) => note.pitch === 64)
    expect(tied).toMatchObject({ start: 2, length: 2, xmlId: 'm3n-e-3' })
    expect(data.continuations).toEqual([{ staff: 'melody', start: 3, xmlId: 'm3n-e-4' }])
  })

  it('converts chord events with per-note ids', () => {
    const data = convert('{key=C} {4/4}\nN: [1 3 5:h] 2 3 4 |||')
    const chord = data.notes.filter((note) => note.start === 0)
    expect(chord.map((note) => note.pitch).sort()).toEqual([60, 64, 67])
    expect(chord.map((note) => note.xmlId).sort()).toEqual(['m3n-e-1-n1', 'm3n-e-1-n2', 'm3n-e-1-n3'])
  })

  it('emits tuplet children with shared quarter time', () => {
    const data = convert('{key=C} {4/4}\nN: [4e3e2e:2] 1 2 3 |||')
    expect(data.tuplets).toHaveLength(1)
    const tuplet = data.tuplets[0]!
    expect(tuplet).toMatchObject({ num: 3, numbase: 2, start: 0, length: 2 })
    expect(tuplet.children).toHaveLength(3)
    expect(tuplet.children.map((child) => child.pitch)).toEqual([77, 76, 74])
    expect(tuplet.children.map((child) => child.start)).toEqual([0, 1, 2])
    expect(data.notes[0]).toMatchObject({ start: 0, length: 1, xmlId: 'm3n-e-1-n1' })
  })

  it('uses the tonic pitch class for key signatures and supports modulation', () => {
    const data = convert('{key=G} {4/4}\nN: 1 2 3 4 | 5 6 7 1 |||')
    expect(data.keySignatures).toEqual([{ start: 0, key: 7 }])
    expect(data.notes[0]?.pitch).toBe(67)
  })

  it('emits a shortened layout meter for pickup measures', () => {
    const data = convert('{key=C} {4/4}\nN: 1 2 | 3 4 5 6 |||')
    expect(data.layoutTimeSignatures.slice(0, 2)).toEqual([
      { start: 0, numerator: 2, denominator: 4 },
      { start: 2, numerator: 4, denominator: 4 },
    ])
    expect(data.timeSignatures).toEqual([{ start: 0, numerator: 4, denominator: 4 }])
    expect(data.measures[1]?.start).toBe(2)
  })

  it('tracks repeat and navigation markers per measure', () => {
    const data = convert('{key=C} {4/4}\nN: ||: 1 2 3 4 | 5 6 7 1 :||{x2}\n---\nN: 1 2 3 4 |||')
    expect(data.measures[0]).toMatchObject({ repeatStart: true })
    expect(data.measures[1]).toMatchObject({ repeatEnd: true, repeatCount: 2 })
  })

  it('attaches lyrics from the generated MEI with verse metadata', () => {
    const data = convert('{title=歌词测试} {key=C} {4/4}\nN: 1 2 3 4 | 5 6 7 1 |||\nL1: 春 天 花 开 | 小 鸟 飞 来')
    const visible = data.lyrics.filter((lyric) => lyric.kind !== 'placeholder')
    expect(visible).toHaveLength(8)
    expect(visible.map((lyric) => lyric.text)).toEqual(['春', '天', '花', '开', '小', '鸟', '飞', '来'])
    expect(visible[0]).toMatchObject({ staff: 'melody', start: 0, verse: 1, n: '1' })
    expect(visible[1]?.start).toBe(1)
  })
})
