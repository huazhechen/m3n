import { compileScorePerformance, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('World Gift uses 47 complete sequential bars and one lyric row', () => {
  const source = readFileSync(new URL('../scores/shi_jie_zeng_yu_wo_de_01.m3n', import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(source).not.toMatch(/---V|:\|\||\|\|:|^===|^L\d+:|^Ns?\[/m)
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(47)
  expect(bars.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
  expect(compileScorePerformance(document).beats).toBe(188)
})
