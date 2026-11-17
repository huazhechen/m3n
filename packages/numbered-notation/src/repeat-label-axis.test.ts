import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { ASTFunctionNode, compileScore, RecordingPainter, type TextMeasurer } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'

const measurer: TextMeasurer = { measureText(text, style) {
  const advance = [...text].reduce((width, char) => width + style.fontSize * (char === '×' ? .7 : .45), 0)
  const left = -1, right = advance + 2
  return { w: advance, advance, inkLeft: left, inkRight: right, centerOffset: (left + right - advance) / 2,
    h: style.fontSize * .7, baseline: style.fontSize * .6 }
} }

it.each([3, 7, 12])('centers the complete repeat label ×%s ink on the closing bar anchor', count => {
  const document = parseM3NDocument(`{4/4}\nN: ||: 1 2 3 4 :||| {x${count}}`)
  const projection = projectNumberedScore(document, { width: 800, paged: false, textMeasurer: measurer })
  const result = compileScore(projection.source, { textMeasurer: measurer, alignRelations: true })
  expect(result.diagnostics).toEqual([])
  const host = result.layout.objects.find(node => node.ast instanceof ASTFunctionNode && node.ast.callName === 'up')!
  expect(host).toBeDefined()
  const painter = new RecordingPainter()
  host.paint(painter)
  const text = painter.commands.find(command => command.kind === 'text' && command.text === `×${count}`)!
  if (text.kind !== 'text') throw new Error('repeat count must be painted')
  const metrics = measurer.measureText(text.text, text.style)
  const alignment = text.style.textAlign === 'center' ? (metrics.advance ?? metrics.w) / 2
    : text.style.textAlign === 'right' ? metrics.advance ?? metrics.w : 0
  const center = text.x - alignment + ((metrics.inkLeft ?? 0) + (metrics.inkRight ?? metrics.w)) / 2
  expect(center).toBeCloseTo(host.box.x + host.box.anchor, 6)
})
