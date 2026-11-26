import { compileScorePerformance, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'

import { expect, it } from 'vitest'
import source from '../scores/annie_01.m3n?raw'

it('uses the first ending for the interlude, a shared second/third ending for D.S. and Fine', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(37)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([4])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([35])
  expect(bars.slice(27).map(bar => bar.ending)).toEqual([...Array(9).fill('1'), '2,3'])
  expect(bars[20]!.navigation).toContain('segno')
  expect(bars[36]!.navigation).toContain('ds')
  expect(bars[36]!.navigation).toContain('fine')
  expect(compileScorePerformance(document).beats).toBe(272)
})
