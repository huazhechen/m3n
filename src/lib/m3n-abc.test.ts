import { describe, expect, it } from 'vitest'
import {
  abcChordToRoman,
  abcToM3N,
  durationInBeats,
  m3nToAbc,
  parseKey,
  parseM3NNote,
  romanChordToAbc,
  splitSupplementBlocks,
} from './m3n-abc'

describe('M3N primitives', () => {
  it('parses keys and notes', () => {
    expect(parseKey('F#min')).toEqual({ tonic: 'F#', mode: 'min' })
    expect(parseM3NNote('3#e^..~')).toEqual({
      degreeRaw: '3',
      accidentals: '#',
      octave: 'e',
      carets: '^',
      dots: '..',
      tie: '~',
    })
    expect(parseM3NNote('8')).toBeNull()
  })

  it('calculates nested and dotted durations', () => {
    expect(durationInBeats(0, 0, 0)).toBe(1)
    expect(durationInBeats(1, 0, 1)).toBe(0.75)
    expect(durationInBeats(2, 1, 2)).toBe(0.875)
  })

  it('converts roman chord names in both directions', () => {
    expect(romanChordToAbc('vi7', 'C')).toBe('"Am7"')
    expect(abcChordToRoman('Am7', 'C')).toBe('vi7')
  })

  it('separates lyrics and bass supplements', () => {
    expect(splitSupplementBlocks('1 2\n{lyrics=A}\nla la\n{/}\n{bass}\n1 0\n{/}')).toEqual({
      main: '1 2\n\n',
      bass: '1 0',
      lyrics: [{ range: 'A', text: 'la la' }],
    })
  })
})

describe('notation conversion', () => {
  const m3n = '{title=Test}\n{key=C} {4/4} {120qpm}\n1 2 3 4 | 5 6 7 1e |||'

  it('converts M3N headers, notes, and source positions', () => {
    const result = m3nToAbc(m3n)
    expect(result.diagnostics).toEqual([])
    expect(result.output).toContain('T:Test')
    expect(result.output).toContain('M:4/4')
    expect(result.output).toContain('Q:1/4=120')
    expect(result.output.replace(/\s+/g, ' ')).toContain('C D E F | G A B c |]')
    expect(result.sourceMap).toHaveLength(8)
  })

  it('preserves the musical body through an ABC round trip', () => {
    const abc = m3nToAbc(m3n).output
    const roundTrip = m3nToAbc(abcToM3N(abc).output)
    expect(roundTrip.output).not.toContain('% pro')
    expect(roundTrip.output.replace(/\s+/g, ' ')).toContain('C D E F | G A B c |]')
  })

  it('treats whitespace inside groups as insignificant', () => {
    const compact = m3nToAbc('{key=C} {2/4}\n[123:2] | [066:2] |')
    const spaced = m3nToAbc('{key=C} {2/4}\n[1 2 3:2] | [0 6 6:2] |')

    expect(compact.output).toBe(spaced.output)
    expect(compact.output).toContain('(3:2:3CDE')
    expect(compact.output).toContain('(3:2:3zAA')
  })

  it('serializes ABC groups without semantic spaces', () => {
    const result = abcToM3N('X:1\nM:2/4\nL:1/4\nK:C\n(3:2:3CDE | [CEG] |')

    expect(result.output).toContain('[123:2]')
    expect(result.output).toContain('[135:h]')
  })
})
