import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { compileScore } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import { projectNativeScore } from './native-model.js'

it.each([false, true])('adds section space only for inline headings, standalone=%s', standalone => {
  const document = parseM3NDocument('{2/4}\n===A\nN: 1 2 ||\n===B' + (standalone ? '{br}' : '') + '\nN: 3 4 |||')
  const source = projectNumberedScore(document, { width: 640, paged: false }).source
  expect(source.includes('@br(gap=12)')).toBe(!standalone)
  const native = projectNativeScore(document, { textMeasurer: { measureText(text, style) {
    return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 }
  } } })
  expect(native.measures[1]!.extraGap).toBe(standalone ? 0 : 12)
  if (standalone) {
    expect(source).toContain('local=true,linestart=true')
    const distance = (input: string) => {
      const result = compileScore(input, { autoWrap: true, systemSpacing: { coreGap: 24, inkGap: 12 } })
      const notes = result.layout.objects.filter(note => !note.T.isZero())
      return notes[2]!.box.y - notes[0]!.box.y
    }
    // An explicit section gap would add another 12px after collision avoidance.
    expect(distance(source.slice(0, source.lastIndexOf('@br()')) + source.slice(source.lastIndexOf('@br()')).replace('@br()', '@br(gap=12)')) - distance(source)).toBeCloseTo(12, 6)
  }
})
