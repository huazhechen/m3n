import { compileScorePerformance, formatM3N, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/g_xian_shang_de_yong_tan_diao_01.m3n?raw'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

// Kuaiyuepu 4bFml142f, checked against its printed G-major score and
// Mutopia BWV1068/bach-air (D-major violin part; twice the notated speed).
it('preserves the complete Air arrangement, chromatic notes and repeat endings without breaths', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(source).not.toContain('{breath}')
  const document = parseM3NDocument(source)
  expect(document.key).toBe('G')
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length > 0)
  expect(bars).toHaveLength(38)
  expect(bars.map(bar => bar.events.reduce((beats, event) => beats + event.beats, 0))).toEqual(Array(38).fill(4))
  const pitches = resolveScorePitches(bars)
  const notes = (bar: number) => bars[bar - 1]!.events.map(event => [pitches.get(event)?.[0], event.beats])
  // The later HJczl1Q9t upload omits these four bars; retain the complete phrase.
  expect([21, 22, 23, 24].map(notes)).toEqual([
    [['g:4:', 2], ['g:4:', .5], ['b:4:', .5], ['a:4:', .5], ['g:4:', .5]],
    [['e:5:', 2], ['e:5:', 1], ['d:5:', .5], ['c:5:s', .5]],
    [['b:4:', .25], ['a:4:', .25], ['d:5:', .5], ['d:4:', 1], ['e:4:', 1.5], ['f:4:s', .25], ['g:4:', .25]],
    [['f:4:s', 1.5], ['e:4:', .5], ['d:4:', 2]],
  ])
  expect(notes(6).slice(2, 6)).toEqual([['f:4:n', .5], ['e:4:', .5], ['a:4:', .5], ['g:4:s', .5]])
  expect(notes(17)[0]).toEqual(['d:4:s', .5])
  expect(notes(31).at(-1)).toEqual(['f:5:n', .5])
  expect(bars.slice(-4).map(bar => bar.ending)).toEqual(['1', '1', '2', '2'])
  expect(notes(35)).toEqual([
    ['g:4:', .25], ['f:4:s', .25], ['e:4:', 1], ['f:4:s', .5],
    ['g:4:', 1], ['f:4:s', .75], ['g:4:', .25],
  ])
  expect(notes(37)).toEqual(notes(35))
  expect(compileScorePerformance(document).beats).toBe(288)
  const file = 'g_xian_shang_de_yong_tan_diao_01.m3n'
  expect(plan.sourceCount).toBe(plan.entries.length)
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(categories.find(category => category.id === 'instrumental')?.files).toEqual(
    plan.entries.filter(entry => entry.section === 'instrumental').map(entry => entry.file),
  )
})
