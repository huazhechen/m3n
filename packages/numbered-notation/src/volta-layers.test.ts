import { expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { projectNumberedScore } from './projection.js'
import { nativeLanePieces } from './native-lanes.js'
import { nativeSvgPieces } from './native-ink.js'
import { nativeRibbonRange } from './native-curve.js'
import type { TextMeasurer } from './native-measure.js'

const textMeasurer: TextMeasurer = { measureText(text, style) {
  return {w:[...text].length * style.fontSize * .5, h:style.fontSize * .7, baseline:style.fontSize * .7}
} }

it.each([
  '{lg}1 2 3 4{/}',
  '1 {mf}2 3 4',
  '1 2{tr} 3 4',
  '{cresc}1 2 3 4{/}',
])('places an ending around painted music primitives in both engines: %s', music => {
  const source = `{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: ${music} :||\n---V2\nN: 1 2 3 4 |||`
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source), options = {width:1000,paged:false,textMeasurer}
  const projection = projectNumberedScore(document, options)
  const reference = compileScore(projection.source, {textMeasurer,autoWrap:true,alignRelations:true,noteGap:13.2,minimumNoteGap:8.8})
  expect(reference.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
  const ending = reference.layout.attachments.find(item => item.sourceSpan && projection.source.slice(item.sourceSpan.start,item.sourceSpan.end).startsWith('@volta('))!
  const native = layoutNativeScore(document,options), system = native.systems[0]!
  const host = reference.layout.objects.find(item => !item.T.isZero())!
  const zero = textMeasurer.measureText('0',{fontSize:22})
  const baseline = host.box.y + host.box.visualAxis + zero.baseline - zero.h / 2
  expect(baseline - ending.box.y).toBeCloseTo(system.voltas![0]!.top,3)
  const inner = reference.layout.attachments.filter(item => item.sourceSpan && /^(?:@tie|@dyn)\(|@symbol\(/.test(projection.source.slice(item.sourceSpan.start,item.sourceSpan.end)))
    .flatMap(item => item.regions).filter(region => region.line === ending.regions[0]!.line && region.x < ending.box.x + ending.box.w && region.x + region.w > ending.box.x)
  expect(inner.length).toBeGreaterThan(0)
  let checked = 0
  for (const mark of nativeSvgPieces(system.voltas![0]!.svg, textMeasurer)) {
    const ink = [...(system.relationLayout ?? [])].flatMap(([, placed]) => placed.arc
      ? [nativeRibbonRange(placed.arc, mark.left, mark.right)].filter(piece => piece !== undefined)
      : nativeSvgPieces(placed.svg, textMeasurer))
    ink.push(...nativeLanePieces(system, textMeasurer, false, false).get('melody')!)
    for (const obstacle of ink) {
      if (obstacle.right <= mark.left || obstacle.left >= mark.right) continue
      expect(mark.bottom).toBeLessThanOrEqual(obstacle.top - 2 + .001)
      checked++
    }
  }
  expect(checked).toBeGreaterThan(0)
  expect(system.voltas![0]!.top).toBeCloseTo(system.voltas![1]!.top,5)
})
