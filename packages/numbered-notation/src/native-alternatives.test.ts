// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { nativeStyle } from './native-style.js'
import { nativeSvgInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'

const source = '{4/4}\nN: ||: 1 2 3 4 | 1 2 3 4 :||\nNs[2]: 1: 1 2 3 4 | 1 2 3 4 |'

describe('native alternative parentheses', () => {
  it.each(['春风', '(春风)(秋雨)'])('centres parentheses on the music axis and brackets music rather than lyrics: %s', lyrics => {
    const textMeasurer: TextMeasurer = { measureText(text, style) {
      const parenthesis = text === '(' || text === ')'
      return { w: [...text].length * style.fontSize * .6, h: style.fontSize * (parenthesis ? .95 : .7), baseline: style.fontSize * (parenthesis ? .86 : .7) }
    } }
    const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: ||: 1 2 :||\nL1: 春风\nL2: ${lyrics}\nNs[2]: 1: 3 4 |`), {width:800, paged:false, textMeasurer})
    const system = layout.systems[0]!, first = system.measures[0]!.columns.flatMap(column => column.glyphs).find(glyph => glyph.lane === 'alternative:2')!
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    const bracket = root.querySelector('[data-m3n-role="alternative-parenthesis"]')!
    expect(Number(bracket.getAttribute('x')) - first.x).toBeCloseTo(-first.musicLeft! - first.parenthesisLeft!, 3)
    const ink = nativeSvgInk(bracket.outerHTML, textMeasurer), zero = textMeasurer.measureText('0', {fontSize:22, fontFamily:'M3N Numbers'})
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(zero.h / 2 - zero.baseline, 3)
  })

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


describe('alternative pass labels share the musical time grid', () => {
  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({width, paged}))))('reserves inline labels at $width, paged=$paged', options => {
    const document = parseM3NDocument('{2/4}{order=A,A,A}\n===A\nN: 1 2 | 3 4 ||\nNs[2]: 1: 5 6 | 7 1e |\nNs[3]: 1: 2e 3e | 4e 5e |')
    const layout = layoutNativeScore(document, options)
    const controls = layout.projection.glyphs.flatMap(g => g.controls.filter(c => c.kind === 'passes'))
    expect(controls.map(c => c.text)).toEqual(['2.', '3.'])
    expect(controls[0]!.x! + controls[0]!.width).toBeLessThan(controls[1]!.x!)
    for (const measure of layout.projection.measures) for (const column of measure.columns) {
      expect(new Set(column.glyphs.map(g => g.x)).size).toBe(1)
    }
    for (const control of controls) {
      const host = layout.projection.glyphs.find(g => g.controls.includes(control))!
      expect(control.x! + control.width).toBeLessThanOrEqual(host.x - host.left)
    }
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    expect([...root.querySelectorAll('[data-m3n-role="alternative-passes"]')].map(node => node.textContent)).toEqual(['2.', '3.'])
    const projection = projectNumberedScore(document, options)
    const result = compileScore(projection.source, {alignRelations:true, autoWrap:true})
    expect(result.diagnostics.filter(d => d instanceof ErrorDiagnostic)).toEqual([])
    const notes = result.layout.objects.filter(o => o.T.toNumber() > 0)
    for (const note of notes) {
      for (const peer of notes.filter(o => o.t.toNumber() === note.t.toNumber())) {
        expect(note.box.x + note.box.anchor).toBeCloseTo(peer.box.x + peer.box.anchor, 5)
      }
    }
  })

  it('omits the ordinary sole second-pass label', () => {
    const layout = layoutNativeScore(parseM3NDocument(source), {width:800, paged:false})
    expect(layout.projection.glyphs.flatMap(g => g.controls).filter(c => c.kind === 'passes')).toEqual([])
  })
})
