import { compileScore } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { projectNumberedScore } from './projection.js'

it.each(['', 'N: 1 2 3 4 |\n---\n'])('assigns a rest to its actual paragraph after %j', prefix => {
  const source = `{4/4}\n${prefix}N: {rest=2} | 1 2 3 4 |||`
  const document = parseM3NDocument(source)
  const options = { width: 320, paged: false, pageMargin: 11, uniformSystemHeight: true }
  const position = source.indexOf('{rest=')
  const paragraph = document.paragraphs!.find(range => range.start <= position && position < range.end)!
  const expected = `0:${paragraph.id}`
  const native = layoutNativeScore(document, options)
  expect(native.projection.glyphs.find(glyph => glyph.multiRest)?.paragraph).toBe(expected)
  const projection = projectNumberedScore(document, options)
  const reference = compileScore(projection.source).layout
  const rest = reference.objects.find(node => 'callName' in node.ast && node.ast.callName === 'rest')!
  expect(rest).toBeDefined()
  expect(rest.addon?.systemHeightGroup).toBe(expected)
})
