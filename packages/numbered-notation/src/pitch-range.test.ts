import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { scientificPitchRange } from './pitch-range.js'

describe('melody pitch range', () => {
  it('uses C4 for middle C and updates octave numbers when transposed', () => {
    const document = parseM3NDocument('{4/4}\nN: 1d 4 4 4 |||')
    expect(scientificPitchRange(document)).toEqual(['C3', 'F4'])
    expect(scientificPitchRange(document, { transpose: -1 })).toEqual(['B2', 'E4'])
  })

  it('uses actual pitch order, octave shifts and inherited accidentals', () => {
    const document = parseM3NDocument('{key=D}{4/4}\nN: 1d 4# 4 7e |||\nB: 1dd^ 1dd^ |')
    expect(scientificPitchRange(document)).toEqual(['D3', 'C#6'])
    expect(scientificPitchRange(document, { fixedDo: true })).toEqual(['D3', 'C#6'])
    expect(scientificPitchRange(document, { fixedDo: true, transpose: -2 })).toEqual(['C3', 'B5'])
    expect(scientificPitchRange(document, { transpose: 5 })).toEqual(['G3', 'F#6'])
    const altered = parseM3NDocument('{4/4}\nN: 4# 4 4 4 |||')
    expect(scientificPitchRange(altered)).toEqual(['F#4', 'F#4'])
  })

  it('uses absolute names across key changes and handles minor scales', () => {
    expect(scientificPitchRange(parseM3NDocument('{key=D}{4/4}\nN: 1 2 3 4 | {key=C}1 2 3 4 |||'))).toEqual(['C4', 'G4'])
    const minor = parseM3NDocument('{key=Am}{4/4}\nN: 1 3 5 7 |||')
    expect(scientificPitchRange(minor)).toEqual(['C4', 'B4'])
    expect(scientificPitchRange(minor, { fixedDo: true })).toEqual(['C4', 'B4'])
  })

  it('includes chords, tuplets, grace notes and alternative melodies', () => {
    const document = parseM3NDocument('{4/4}\nN: ||: [135] [3 4 5:1] 6{ac(1dd)} 1 :||\nNs[2]: 1: 1 2 3 7ee |')
    expect(scientificPitchRange(document)).toEqual(['C2', 'B6'])
    expect(scientificPitchRange(parseM3NDocument('{4/4}\nN: [1d 3 5e:h] [1 2 7e:1] 0 0 |||'))).toEqual(['C3', 'B5'])
  })

  it('omits the range for silence and ignores accompaniment', () => {
    expect(scientificPitchRange(parseM3NDocument('{4/4}\nN: 0 0 0 0 |||\nB: 1 2 3 4 |'))).toBeUndefined()
    expect(scientificPitchRange(parseM3NDocument(''))).toBeUndefined()
  })
})
