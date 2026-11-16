import { describe, expect, it } from 'vitest'
import { parseM3NDocument, compileScorePerformance } from '@m3n/notation'
import { compileScore } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import { fixedDoPitch } from './fixed-do.js'

const options = { width: 800, paged: false }
const notes = (source: string) => [...source.matchAll(/@note\("([^"]+)"/g)].map(match => match[1])

describe('fixed C numbered notation', () => {
  it('respells enharmonics and crosses octave boundaries using sharps only', () => {
    expect(['c:4:s', 'd:4:f', 'e:4:f', 'b:3:s', 'c:4:f', 'f:5:ss'].map(fixedDoPitch))
      .toEqual(['#1', '#1', '#2', 'n1', 'n7,', "n5'"])
  })
  it('resolves key changes and measure accidentals before displaying C-based degrees', () => {
    const document = parseM3NDocument('{key=Bb}{4/4}\nN: 1 3 5 7 | {key=D}1 3 4# 4 | 4 4= 0 1 |||')
    const before = compileScorePerformance(document)
    const normal = projectNumberedScore(document, options)
    const fixed = projectNumberedScore(document, { ...options, fixedDo: true })
    expect(notes(fixed.source)).toEqual(['#6', "n2'", "n4'", "n6'", 'n2', '#4', '#5', '#5', 'n5', 'n5', '0', 'n2'])
    expect(fixed.source.match(/@key\([^)]*\)/g)).toEqual(['@key("C4",size=16px)'])
    expect([...fixed.bindings.values()].map(binding => binding.xmlId)).toEqual([...normal.bindings.values()].map(binding => binding.xmlId))
    expect(compileScorePerformance(document)).toEqual(before)
    expect(document.key).toBe('Bb')
  })
  it('covers bass, chords, tuplets, grace notes and alternate melodies', () => {
    const document = parseM3NDocument('{key=Db}{2/4}\nN: ||: [1 3 5:h] 2 | [3 4 5:1] 6{ac(1)} :||\nB: 1d^ | 5d^ |\nNs[2]: 2: 7 1e |')
    const fixed = projectNumberedScore(document, { ...options, fixedDo: true })
    const pitches = notes(fixed.source)
    expect(pitches).toContain('#1')
    expect(pitches).toContain('n4')
    expect(pitches).toContain('#5')
    expect(pitches).toContain('#1,')
    expect(pitches).toContain("n1'")
    expect(fixed.source).toContain('@grace(')
    expect(pitches.every(pitch => pitch === '0' || /^[#n][1-7][\x27,]*$/.test(pitch))).toBe(true)
    expect(compileScore(fixed.source, { autoWrap: true }).diagnostics.filter(diagnostic => diagnostic.code.startsWith('E_'))).toEqual([])
  })
})
