// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { nativeStyle } from './native-style.js'

const source = '{4/4}\nN: ||: 1 2 3 4 | 1 2 3 4 :||\nNs[2]: 1: 1 2 3 4 | 1 2 3 4 |'

describe('native alternative parentheses', () => {
  it('includes both measured parentheses in each alternative measure’s natural and minimum width', () => {
    const plain = layoutNativeScore(parseM3NDocument(source.split('\nNs')[0]!), { width: 800, paged: false })
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false })
    for (const [index, measure] of layout.projection.measures.entries()) {
      const members = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === 'alternative:2')
      const extra = members[0]!.parenthesisLeft! + members.at(-1)!.parenthesisRight!
      expect(extra).toBeGreaterThan(nativeStyle.music)
      // Shared melody/bar springs can already supply part of the space;
      // the parallel lane must constrain the solve, not add a fixed total.
      expect(measure.natural).toBeGreaterThan(plain.projection.measures[index]!.natural)
      expect(measure.minimum).toBeGreaterThan(plain.projection.measures[index]!.minimum)
    }
  })

  it.each([false, true])('keeps each phrase’s actual bracket ink inside its system (equal measures: %s)', equalMeasures => {
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 320, paged: true, equalMeasures })
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    expect(root.querySelectorAll('[data-m3n-role="alternative-parenthesis"]')).toHaveLength(4)
    for (const system of layout.systems) for (const relation of system.relations.filter(relation => relation.kind === 'inst')) {
      const { ink } = system.relationLayout!.get(relation)!
      expect(ink.left).toBeGreaterThanOrEqual(layout.margin - 0.01)
      expect(ink.right).toBeLessThanOrEqual(320 - layout.margin + 0.01)
      const lane = system.lanes.find(lane => lane.id === relation.first.lane)!
      expect(lane.top).toBeGreaterThanOrEqual(-ink.top)
      expect(lane.bodyBottom).toBeGreaterThanOrEqual(ink.bottom)
    }
  })

  it('reserves a pair on every system when an oversized alternative measure wraps', () => {
    const notes = Array(24).fill('1').join(' ')
    const layout = layoutNativeScore(parseM3NDocument(`{24/4}\nN: ||: ${notes} :||\nNs[2]: 1: ${notes} |`), { width: 320, paged: false })
    expect(layout.systems.length).toBeGreaterThan(1)
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    for (const system of root.querySelectorAll('g.system')) {
      const brackets = [...system.querySelectorAll('[data-m3n-role="alternative-parenthesis"]')]
      expect(brackets.map(node => node.textContent)).toEqual(['(', ')'])
      expect(Number(brackets[0]!.getAttribute('x'))).toBeGreaterThanOrEqual(32 - 0.01)
      expect(Number(brackets[1]!.getAttribute('x')) + 22 * 0.58).toBeLessThanOrEqual(288 + 0.01)
    }
  })
})
