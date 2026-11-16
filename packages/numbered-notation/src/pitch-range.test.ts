import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { numberedPitchRange } from './pitch-range.js'

describe('melody pitch range', () => {
  it('uses actual pitch order, octave shifts and inherited accidentals', () => {
    const document = parseM3NDocument('{key=D}{4/4}\nN: 1d 4# 4 7e |||\nB: 1dd^ 1dd^ |')
    expect(numberedPitchRange(document)).toEqual(['1,', "7'"])
    expect(numberedPitchRange(document, { fixedDo: true })).toEqual(['2,', "#1''"])
    expect(numberedPitchRange(document, { fixedDo: true, transpose: -2 })).toEqual(['1,', "7'"])
    expect(numberedPitchRange(document, { transpose: 5 })).toEqual(['1,', "7'"])
    const altered = parseM3NDocument('{4/4}\nN: 4# 4 4 4 |||')
    expect(numberedPitchRange(altered)).toEqual(['#4', '#4'])
  })

  it('expresses key changes against the opening key and handles minor scales', () => {
    expect(numberedPitchRange(parseM3NDocument('{key=D}{4/4}\nN: 1 2 3 4 | {key=C}1 2 3 4 |||'))).toEqual(['b7,', '4'])
    const minor = parseM3NDocument('{key=Am}{4/4}\nN: 1 3 5 7 |||')
    expect(numberedPitchRange(minor)).toEqual(['1', '7'])
    expect(numberedPitchRange(minor, { fixedDo: true })).toEqual(['1', '7'])
  })

  it('includes chords, tuplets, grace notes and alternative melodies', () => {
    const document = parseM3NDocument('{4/4}\nN: ||: [135] [3 4 5:1] 6{ac(1dd)} 1 :||\nNs[2]: 1: 1 2 3 7ee |')
    expect(numberedPitchRange(document)).toEqual(['1,,', "7''"])
    expect(numberedPitchRange(parseM3NDocument('{4/4}\nN: [1d 3 5e:h] [1 2 7e:1] 0 0 |||'))).toEqual(['1,', "7'"])
  })

  it('omits the range for silence and ignores accompaniment', () => {
    expect(numberedPitchRange(parseM3NDocument('{4/4}\nN: 0 0 0 0 |||\nB: 1 2 3 4 |'))).toBeUndefined()
    expect(numberedPitchRange(parseM3NDocument(''))).toBeUndefined()
  })
})
