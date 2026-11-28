import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'

it.each([
  { width: 320, fixedDo: false, bass: false },
  { width: 320, fixedDo: true, bass: true },
  { width: 800, fixedDo: false, bass: true },
  { width: 800, fixedDo: true, bass: false },
])(
  'ignores a redundant leading separator at $width, fixed=$fixedDo, bass=$bass', ({width, fixedDo, bass}) => {
    const render = (bar: string) => {
      const source = `{4/4}{order=A,A}\n===A\nN: ${bar}1 2 3 4 |||${bass ? `\nB: ${bar}1d 2d 3d 4d |||` : ''}`
      const layout = layoutNativeScore(parseM3NDocument(source), {width, fixedDo, paged:false})
      return {height:layout.pages[0]!.height, notes:layout.projection.glyphs.map(glyph => ({x:glyph.x,y:glyph.y}))}
    }
    expect(render('| ')).toEqual(render(''))
  },
)
