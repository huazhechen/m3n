import { parseM3NDocument } from '@m3n/notation'
import { readFileSync } from 'node:fs'
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
  it.each([480, 540, 600, 720])('keeps wrapped Katyusha parentheses inside the music margins at %ipx', width => {
    const source = readFileSync(new URL('../../../src/scores/katyusha_01.m3n', import.meta.url), 'utf8')
    const layout = layoutNativeScore(parseM3NDocument(source), { width, paged: true, pageMargin: 11 })
    let fragments = 0
    for (const system of layout.systems) for (const relation of system.relations) {
      if (relation.kind !== 'inst') continue
      fragments++
      const { ink } = system.relationLayout!.get(relation)!
      expect(ink.left).toBeGreaterThanOrEqual(layout.margin - 1e-5)
      expect(ink.right).toBeLessThanOrEqual(width - layout.margin + 1e-5)
    }
    expect(fragments).toBeGreaterThanOrEqual(width <= 600 ? 2 : 1)
  })

  for (const width of [320, 800]) for (const minimumNoteGap of [9, 15]) it.each(examples)('%s at ' + width + ', gap ' + minimumNoteGap, (_name, notes) => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: {inst}${notes}{/} |||`), { width, paged: false, pageMargin: 11, minimumNoteGap })
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
    expect(leftInk.left - leftX - advance).toBeGreaterThanOrEqual(minimumNoteGap - 1e-5)
    expect(rightX - rightInk.right).toBeGreaterThanOrEqual(minimumNoteGap - 1e-5)
  })
})
