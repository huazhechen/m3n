import { describe, expect, it } from 'vitest'
import { compileScore } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { layoutNativeScore } from './native-layout.js'

describe('leading ordinary section boundaries', () => {
  it.each([320, 800].flatMap(width => [false, true].flatMap(fixedDo => [false, true].map(bass => ({width, fixedDo, bass})))))(
    'does not create a bar-only system at $width, fixed=$fixedDo, bass=$bass', ({width, fixedDo, bass}) => {
      const render = (bar: string) => {
        const source = `{4/4}{order=A,A}\n===A\nN: ${bar}1 2 3 4 |||${bass ? `\nB: ${bar}1d 2d 3d 4d |||` : ''}`
        const document = parseM3NDocument(source)
        const projection = projectNumberedScore(document, {width, fixedDo, paged:false})
        const layout = compileScore(projection.source).layout
        const native = layoutNativeScore(document, {width, fixedDo, paged:false})
        return {nativeHeight:native.pages[0]!.height, nativeNotes:native.projection.glyphs.map(glyph => ({x:glyph.x,y:glyph.y})),
          height:layout.bounds.h, notes:layout.objects.filter(node => !node.T.isZero()).map(node => ({
          x:node.box.x + node.box.anchor, y:node.box.y + node.box.visualAxis,
        }))}
      }
      expect(render('| ')).toEqual(render(''))
    },
  )
})
