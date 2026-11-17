import { parseM3NDocument } from '@m3n/notation'
import { compileScore } from '@m3n/jpfun'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { projectNumberedScore } from './projection.js'

it.each([.45, .5, .55])('keeps a dense equal-measure bar out of sparse compact rows with glyph width %iem', factor => {
  const textMeasurer = { measureText(text: string, style: { fontSize: number }) {
    return { w: [...text].reduce((sum, character) => sum + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : factor), 0), h: style.fontSize, baseline: style.fontSize * .8 }
  } }
  const document = parseM3NDocument('{equal-measures=true}\n{4/4}\nN: {inst}1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e){/} | 1^^ |||\nL: 花')
  const options = { width: 320, paged: false, pageMargin: 11, noteGapEm: .5, wrap: 'compact' as const, textMeasurer }
  const reference = compileScore(projectNumberedScore(document, options).source,
    { textMeasurer, autoWrap: true, noteGap: 11, wrap: 'compact', equalMeasures: true })
  const rows = new Set(reference.layout.objects.filter(node => !node.T.isZero()).map(node => node.layoutLine))
  expect(rows.size).toBe(3)
  const native = layoutNativeScore(document, options)
  expect(native.systems.map(system => system.measures.map(measure => measure.index))).toEqual([[0], [1], [2]])
})

it('balances unused capacity and compression against the actual content width', () => {
  const textMeasurer = { measureText(text: string, style: { fontSize: number }) {
    return { w: [...text].length * style.fontSize * .5, h: style.fontSize, baseline: style.fontSize * .8 }
  } }
  const document = parseM3NDocument('{4/4}\nN: (1 2 3 4 5 6 7 1e) | ((1 2 3 4 5 6 7 1e)) 2 3 | (1 2 3 4 5 6 7 1e) | (1 2 3 4 5 6 7 1e) | 1^^ |||')
  const options = { width: 320, paged: false, pageMargin: 11, noteGapEm: .5, wrap: 'compact' as const, textMeasurer }
  const reference = compileScore(projectNumberedScore(document, options).source,
    { textMeasurer, autoWrap: true, noteGap: 11, wrap: 'compact' })
  const durations = new Map<number, number>()
  for (const node of reference.layout.objects) if (!node.T.isZero()) durations.set(node.layoutLine, (durations.get(node.layoutLine) ?? 0) + node.T.toNumber())
  expect([...durations.values()]).toEqual([8, 4, 8])
  const native = layoutNativeScore(document, options)
  expect(native.systems.map(system => system.measures.map(measure => measure.index))).toEqual([[0, 1], [2], [3, 4]])
})
