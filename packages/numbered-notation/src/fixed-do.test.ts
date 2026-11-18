import { compileScorePerformance,parseM3NDocument } from '@m3n/notation'
import { expect,it } from 'vitest'
import { fixedDoPitch,numberedKeyLabel } from './fixed-do.js'
import { layoutNativeScore } from './native-layout.js'

it('uses 6=tonic for minor keys', () => {
  expect(numberedKeyLabel('Am')).toBe('6=A')
  expect(numberedKeyLabel('Bbm')).toBe('6=Bb')
})
it('respells enharmonics and crosses octave boundaries using sharps only', () => {
  expect(['c:4:s', 'd:4:f', 'e:4:f', 'b:3:s', 'c:4:f', 'f:5:ss'].map(pitch => fixedDoPitch(pitch)))
    .toEqual(['#1', '#1', '#2', 'n1', 'n7,', "n5'"])
})
it.each([false, true])('preserves source and playback during fixed-do display, fixed=%s', fixedDo => {
  const document = parseM3NDocument('{key=Am}{4/4}\nN: 6d 7d 1 2 | {key=Em}3 4 5# 6 |||')
  const before = structuredClone(document), performance = compileScorePerformance(document)
  const result = layoutNativeScore(document, { width: 800, paged: false, fixedDo, transpose: 1 })
  expect(result.projection.glyphs).toHaveLength(8)
  expect(result.projection.glyphs.some(g => g.pitches.some(p => p.accidental === '♯'))).toBe(true)
  expect(document).toEqual(before)
  expect(compileScorePerformance(document)).toEqual(performance)
})
it('scales every displayed tempo control without changing performance', () => {
  const document = parseM3NDocument('{4/4}{120qpm}\nN: 1 2 3 4 | {60qpm}5 6 7 1e |||')
  const before = compileScorePerformance(document)
  const result = layoutNativeScore(document, { width: 800, paged: false, tempoScale: 1.5 })
  expect(result.projection.glyphs.flatMap(g => g.controls).filter(c => c.kind === 'tempo').map(c => c.text)).toEqual(['♩ = 90'])
  expect(compileScorePerformance(document)).toEqual(before)
})
