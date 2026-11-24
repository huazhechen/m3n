import { expect, it } from 'vitest'
import { compileScorePerformance } from '../performance.js'
import { formatM3N } from '../m3n-format.js'
import { parseM3NDocument } from '../m3n-direct.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import { parseM3NTupletPitches } from './m3n-groups.js'

it('keeps internal slur endpoints independent of the tuplet and its ties', () => {
  expect(parseM3NTupletPitches('3 {lg}4 5{/}')).toEqual({ pitches: ['3', '4', '5'], internalSlurs: [[1, 2]], internalTies: [], tiesFromLast: false })
  expect(parseM3NTupletPitches('{lg}3~ 3 5{/}')).toMatchObject({ internalSlurs: [[0, 2]], internalTies: [0] })
  const source = '{4/4}\nN: ([3 {lg}4 5{/}:2]) 1^. |||\nL: 纺车%好'
  expect(validateM3NDiagnostics(source)).toEqual([])
  const score = parseM3NDocument(source)
  expect(score.parts.get('score')!.melody[0]!.events[0]).toMatchObject({ pitches: ['3', '4', '5'], tupletSlurs: [[1, 2]], beats: 1 })
  expect(parseM3NDocument(formatM3N(source)).parts.get('score')!.melody[0]!.events[0]!.tupletSlurs).toEqual([[1, 2]])
  expect(compileScorePerformance(score).notes).toEqual(compileScorePerformance(parseM3NDocument(source.replace('{lg}', '').replace('{/}', ''))).notes)
})

it.each(['3 {lg}4 5', '3 4{/}5', '3 {lg}4{/} 5', '3 {lg}0 5{/}', '3 {lg}4 0{/}', '3 {inst}4 5{/}', '3 {lg}{/}4 5'])('rejects invalid tuplet slur scopes: %s', body => {
  expect(parseM3NTupletPitches(body)).toBeNull()
  expect(validateM3NDiagnostics(`{4/4}\nN: ([${body}:2]) 1^. |||`).some(diagnostic => diagnostic.severity === 'error')).toBe(true)
})
