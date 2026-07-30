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
import { validateM3N } from './m3n-validate'

describe('M3N primitives', () => {
  it('parses keys and notes', () => {
    expect(parseKey('F#m')).toEqual({ tonic: 'F#', mode: 'm' })
    expect(parseM3NNote('3#e^..~')).toEqual({
      degreeRaw: '3',
      accidentals: '#',
      octave: 'e',
      carets: '^',
      dots: '..',
      tie: '~',
    })
    expect(parseM3NNote('8')).toBeNull()
    expect(parseM3NNote('1#b')).toBeNull()
    expect(parseM3NNote('1ed')).toBeNull()
    expect(parseM3NNote('0~')).toBeNull()
  })

  it('calculates nested and dotted durations', () => {
    expect(durationInBeats(0, 0, 0)).toBe(1)
    expect(durationInBeats(1, 0, 1)).toBe(0.75)
    expect(durationInBeats(2, 1, 2)).toBe(0.875)
  })

  it('converts roman chord names in both directions', () => {
    expect(romanChordToAbc('vi7', 'C')).toBe('"Am7"')
    expect(romanChordToAbc('III', 'D')).toBe('"F#"')
    expect(romanChordToAbc('I', 'Bb')).toBe('"Bb"')
    expect(abcChordToRoman('Am7', 'C')).toBe('vi7')
  })

  it('separates lyrics and bass supplements', () => {
    expect(splitSupplementBlocks('1 2\n{lyrics=A}\nla la\n{/}\n{bass}\n1 0\n{/}')).toEqual({
      main: '1 2\n\n',
      bass: '1 0',
      lyrics: [{ range: 'A', text: 'la la' }],
    })
  })

  it('supports named supplement closes and nested bass intervals', () => {
    expect(splitSupplementBlocks('1 |||\n{lyrics=2}\nla\n{/lyrics}\n{bass}{lg}1 2{/} 3 4 |||{/bass}')).toEqual({
      main: '1 |||\n\n',
      bass: '{lg}1 2{/} 3 4 |||',
      lyrics: [{ range: '2', text: 'la' }],
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

  it('preserves all specified metadata through an ABC round trip', () => {
    const source = [
      '{title=T} {lyricist=L} {arranger=A} {copyright=C} {source=S} {note=N}',
      '{key=C} {4/4} 1 2 3 4 |||',
    ].join('\n')
    const abc = m3nToAbc(source).output
    expect(abc).toContain('N:M3N lyricist=L')
    expect(abc).toContain('N:M3N arranger=A')
    const restored = abcToM3N(abc).output
    expect(restored).toContain('{lyricist=L}')
    expect(restored).toContain('{arranger=A}')
    expect(restored).toContain('{copyright=C}')
    expect(restored).toContain('{source=S}')
    expect(restored).toContain('{note=N}')
  })

  it('preserves lyric pass ranges through an ABC round trip', () => {
    const source = '{key=C} {2/4} 1 2 :|||\n{lyrics=2~4}la la{/lyrics}'
    const abc = m3nToAbc(source).output
    expect(abc).toContain('N:M3N lyrics=2~4')
    expect(abcToM3N(abc).output).toContain('{lyrics=2~4}')
  })

  it('renders modal chord roots, re-evaluates sustained chords, and closes legato', () => {
    const result = m3nToAbc('{key=D} {4/4} {chord=III}{lg}1 2{/} {key=G}3 4 |||')
    expect(result.output).toContain('"F#"')
    expect(result.output).toContain('K:G\n"B"')
    expect(result.output).toMatch(/\(D\s+E\)/)
    expect(abcToM3N(result.output).output).toContain('{lg}1 2{/lg}')
  })

  it('uses text when an ABC chord cannot be represented by M3N chord syntax', () => {
    expect(abcChordToRoman('C#dim7', 'C')).toBeNull()
    expect(abcToM3N('X:1\nM:4/4\nL:1/4\nK:C\n"C#dim7"C D E F |]').output).toContain('{text=C#dim7}')
  })

  it('normalizes ABC mode names to documented M3N suffixes', () => {
    expect(abcToM3N('X:1\nM:4/4\nL:1/4\nK:F#min\nF,G,A,B, |').output).toContain('{key=F#m}')
  })

  it('resets settings at every named-part boundary', () => {
    const source = [
      '{parts=A B A} {key=C} {4/4}',
      '{part=B}{key=G}1 2 3 4 ||{/}',
      '{part=A}1 2 3 4 ||{/}',
    ].join('\n')
    const abc = m3nToAbc(source).output
    expect(abc).toMatch(/P:B\s+K:G/)
    expect(abc).toMatch(/P:A\s+K:C/)
    const restored = abcToM3N(abc).output
    expect(restored).toContain('{/part}')
    expect(validateM3N(restored)).toEqual([])
  })

  it('mirrors melody setting changes onto the bass timeline', () => {
    const abc = m3nToAbc('{key=C} {2/4} 1 2 | {key=G}1 2 |||\n{bass}1d 2d | 1d 2d |||{/}').output
    const bass = abc.slice(abc.indexOf('V:bass'))
    expect(bass).toContain('K:G')
  })
})
