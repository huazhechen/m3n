import { describe, expect, it } from 'vitest'
import { m3nPitch, parseM3NDocument } from './m3n-direct.js'
import { m3nChord } from './m3n-harmony.js'
import { m3nToMei } from './m3n-mei.js'
import { compileScorePerformance } from './performance.js'

const pitches = (source: string) => compileScorePerformance(parseM3NDocument(source)).notes.map(note => note.pitch)

describe('la-based minor solfege', () => {
  it.each([['Am', 'C'], ['Dm', 'F'], ['Em', 'G'], ['Gm', 'Bb'], ['F#m', 'A'], ['Bbm', 'Db'], ['Abm', 'Cb']])(
    '%s shares numbered pitches with its relative major %s', (minor, major) => {
      for (const token of ['1', '2', '3', '4', '5', '6', '7', '6d', '1e', '5#', '5=', '3b']) {
        expect(m3nPitch(token, minor)).toEqual(m3nPitch(token, major))
      }
    },
  )

  it('plays the A minor scale from low la and raises sol for harmonic minor', () => {
    expect(pitches('{key=Am}{4/4}\nN: 6d 7d 1 2 | 3 4 5# 6 |||'))
      .toEqual([57, 59, 60, 62, 64, 65, 68, 69])
    expect(pitches('{key=Am}{4/4}\nN: 5# 5 5= 5 | 5 6 7 1e |||'))
      .toEqual([68, 68, 67, 67, 67, 69, 71, 72])
  })

  it('shares the convention across bass, chords, tuplets and grace notes', () => {
    const source = '{key=Am}{4/4}\nN: [6d 1 3:h] ([6d 7d 1:2]) 6{ac(5#)} 0 |||\nB: 6dd^^ |'
    expect(pitches(source)).toEqual(pitches(source.replace('{key=Am}', '{key=C}')))
    const result = m3nToMei('{key=Am}{4/4}\nN: 6d 1 3 6 |||')
    expect(result.diagnostics).toEqual([])
    expect(result.mei).toContain('<keySig sig="0"/>')
    expect(result.mei).toContain('pname="a" oct="3"')
    expect(result.mei).toContain('pname="c" oct="4"')
  })

  it('keeps ties valid across relative major/minor changes and selects repeat alternatives', () => {
    expect(pitches('{key=C}{2/4}\nN: 1^~ | {key=Am}1^ |||')).toEqual([60])
    expect(pitches('{key=Am}{2/4}\nN: ||: 6d 7d :|||\nNs[2]: 1: 1 6 |')).toEqual([57, 59, 60, 69])
  })

  it('keeps Roman chord degrees relative to the minor tonic', () => {
    expect(['i', 'III', 'iv', 'V', 'VI', 'VII'].map(chord => m3nChord(chord, 'Am')?.symbol))
      .toEqual(['Am', 'C', 'Dm', 'E', 'F', 'G'])
    expect(m3nChord('i', 'Bbm')?.symbol).toBe('Bbm')
    expect(m3nChord('Cmaj7', 'Am')?.symbol).toBe('Cmaj7')
    expect(m3nPitch('1', 'Ddor')).toMatchObject({ pname: 'd', oct: 4 })
  })
})
