import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { NativeMusicPainter } from './native-music.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'

const examples = [
  ['sharp', '1# 2 3 4'],
  ['natural', '1= 2 3 4'],
  ['flat', '1b 2 3 4'],
  ['upper chord sharp', '[1 4#:h] 2 3 4'],
  ['grace', '1{ac(4#)} 2 3 4'],
  ['arpeggio', '[1 3 5:h]{arp} 2 3 4'],
  ['beams', '(1 2 3 4 5 6 7 1e)'],
  ['sustain', '1^^'],
]

describe('instrumental parentheses clear painted host edges', () => {
  for (const width of [320, 800]) it.each(examples)('%s at ' + width, (_name, notes) => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: {inst}${notes}{/} |||`), { width, paged: false, pageMargin: 11 })
    const system = layout.systems[0]!
    const relation = system.relations.find(relation => relation.kind === 'inst')!
    const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
      .filter(glyph => glyph.lane === relation.first.lane)
    const first = members[0]!, last = members.at(-1)!
    const svg = system.relationLayout!.get(relation)!.svg
    const leftX = Number(svg.match(/<text\b[^>]*\bx="([^"]+)"[^>]*>\(<\/text>/)![1])
    const rightX = Number(svg.match(/<text\b[^>]*\bx="([^"]+)"[^>]*>\)<\/text>/)![1])
    const painter = new NativeMusicPainter(layout.measurer)
    const leftInk = nativeSvgInk(painter.music(first), layout.measurer)
    const rightInk = nativeSvgInk(painter.music(last), layout.measurer)
    const advance = layout.measurer.measureText('(', { fontSize: nativeStyle.music, fontFamily: 'M3N Numbers' }).w
    expect(leftInk.left - leftX - advance).toBeGreaterThanOrEqual(nativeStyle.music * 0.05 - 1e-5)
    expect(rightX - rightInk.right).toBeGreaterThanOrEqual(nativeStyle.music * 0.05 - 1e-5)
  })
})
