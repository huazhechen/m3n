import { compileScorePerformance, parseM3NDocument, unfoldScorePerformance } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('Blue Bird visits five complete sections in the approved nine-part order', () => {
  const source = readFileSync(new URL('../scores/qing_niao_01.m3n', import.meta.url), 'utf8')
  const document = parseM3NDocument(source)
  expect(document.order).toEqual(['A', 'B', 'C', 'D', 'B', 'C', 'E', 'C', 'D'])
  expect(source).not.toMatch(/---V|:\|\||\|\|:|\{(?:segno|ds|dc|fine)\}/)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(60)
  expect(['A','B','C','D','E'].map(name => bars.filter(bar => bar.sectionName === name).length)).toEqual([9,17,12,8,14])
  expect(bars.every(bar => bar.events.reduce((sum,event) => sum + event.beats,0) === 4)).toBe(true)
  expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(109)
  expect(compileScorePerformance(document).beats).toBe(436)
})
