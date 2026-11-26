import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('returns Xin Bu Liao Qing to full bars through three endings', () => {
  const source = readFileSync(new URL('../scores/xin_bu_liao_qing_01.m3n', import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  const bars = parseM3NDocument(source).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars[0]!.events.reduce((sum, event) => sum + event.beats, 0)).toBe(1)
  expect(bars[1]!.left).toBe('rptstart')
  expect(bars.findIndex(bar => bar.navigation?.includes('segno'))).toBe(17)
  expect(bars.slice(-3).map(bar => bar.ending)).toEqual(['1', '2', '3'])
  expect(bars.slice(1, -1).every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
  expect(bars.at(-1)!.events.reduce((sum, event) => sum + event.beats, 0)).toBe(3)
})
