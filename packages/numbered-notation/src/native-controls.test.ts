// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { nativeHorizontalSpacing } from './native-horizontal.js'

const changes = '{key=C} {4/4} {90qpm}\nN: 1 2 3 4 | {key=G} {3/4} {120qpm} 5 6 7 |||'

describe('native inline control occupancy', () => {
  it.each([320, 800])('reserves separate control columns before their note at %spx', width => {
    const layout = layoutNativeScore(parseM3NDocument(changes), { width, paged: false })
    const first = layout.projection.glyphs.find(glyph => glyph.controls.length)!
    expect(first.controls.map(control => control.kind)).toEqual(['key', 'meter', 'tempo'])
    const rightEdges = first.controls.map(control => control.x! + control.width)
    first.controls.slice(1).forEach((control, index) => expect(control.x!).toBeGreaterThanOrEqual(rightEdges[index]! - 0.1))
    expect(first.x - first.musicLeft!).toBeGreaterThanOrEqual(rightEdges.at(-1)! - 0.1)
    const system = layout.systems.find(system => system.measures.some(measure => measure.id === first.measureId))!
    const lane = system.lanes.find(lane => lane.id === first.lane)!
    const meter = first.controls.find(control => control.kind === 'meter')!
    expect(lane.top).toBeGreaterThanOrEqual(meter.top)
    expect(lane.bottom).toBeGreaterThanOrEqual(meter.bottom)
  })

  it('draws a stacked meter inside its measured envelope', () => {
    const pages = NativeNumberedNotationScore.create(parseM3NDocument(changes)).render({ width: 800, paged: false })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    const meter = root.querySelector('[data-m3n-control="meter"]')!
    const [numerator, denominator] = [...meter.querySelectorAll('text')]
    expect(numerator!.textContent).toBe('3')
    expect(denominator!.textContent).toBe('4')
    const fractionLine = meter.querySelector('rect')!
    expect(Number(numerator!.getAttribute('y'))).toBeLessThan(Number(fractionLine.getAttribute('y')))
    expect(Number(denominator!.getAttribute('y'))).toBeGreaterThan(Number(fractionLine.getAttribute('y')))
    expect(numerator!.getAttribute('x')).toBe(denominator!.getAttribute('x'))
  })

  it('aligns the control columns and following notes of parallel voices', () => {
    const source = changes + '\nB: 1d 2d 3d 4d | {key=G} {3/4} {120qpm} 5d 6d 7d |||'
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false })
    const melody = layout.projection.glyphs.find(glyph => glyph.lane === 'melody' && glyph.controls.length)!
    const bass = layout.projection.glyphs.find(glyph => glyph.lane === 'bass' && glyph.controls.length)!
    expect(bass.x).toBeCloseTo(melody.x, 6)
    melody.controls.forEach((control, index) => expect(bass.controls[index]!.x).toBeCloseTo(control.x!, 6))
  })

  it('reserves navigation text before the closing bar without covering the final note', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {segno} 1 2 3 4 {ds}|||'), { width: 320, paged: false })
    const measure = layout.projection.measures[0]!, note = layout.projection.glyphs.at(-1)!, navigation = measure.navigation![0]!
    expect(navigation.text).toBe('D.S.')
    expect(navigation.x!).toBeGreaterThan(note.x + note.musicRight!)
    expect(navigation.x! + navigation.width).toBeLessThan(measure.barX!)
    const first = layout.projection.glyphs[0]!, segno = first.controls[0]!
    expect(segno.kind).toBe('segno')
    expect(first.x - first.musicLeft!).toBeGreaterThan(segno.x! + segno.width)
  })
})

describe('native instrumental parentheses', () => {
  it.each([9, 12, 15])('reserves enclosure clearance only at the passage endpoints at gap %s', minimumNoteGap => {
    const width = (music: string) => {
      const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |`), { width: 2000, paged: false, pageMargin: 0, minimumNoteGap })
      return nativeHorizontalSpacing(layout.projection.measures, { minimumNoteGap }).minimumWidth
    }
    const short = '(5 6 5 6)', long = '(5 6 5 6 5 6 5 6)'
    expect(width(`{inst}${short}{/}`) - width(short)).toBeCloseTo(width(`{inst}${long}{/}`) - width(long))
  })
  it('uses one pair for adjacent instrumental declarations', () => {
    const source = '{4/4}\nN: {inst}1 2{/} {inst}3 4{/} |||'
    const pages = NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 800, paged: false })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    expect([...root.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')].map(node => node.textContent)).toEqual(['(', ')'])
  })

  it('reserves the measured bracket ink and clearance at both interval endpoints', () => {
    const plain = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), { width: 800, paged: false })
    const instrumental = layoutNativeScore(parseM3NDocument('{4/4}\nN: {inst}1 2 3 4{/} |||'), { width: 800, paged: false })
    const first = instrumental.projection.glyphs[0]!, last = instrumental.projection.glyphs.at(-1)!
    const added = first.parenthesisLeft! + last.parenthesisRight!
    expect(added).toBeGreaterThan(0)
    const before = plain.projection.measures[0]!, after = instrumental.projection.measures[0]!
    expect(after.minimum - before.minimum).toBeCloseTo(added, 6)
    expect(after.minimum - before.minimum).toBeCloseTo(added, 6)
    expect(first.x - first.musicLeft! - first.parenthesisLeft!).toBeCloseTo(32, 6)
  })

  it.each([false, true])('uses only passage endpoints across wrapped systems (equal measures: %s)', equalMeasures => {
    const source = `{4/4}\nN: {inst}${Array(39).fill('1 2 3 4 |').join(' ')} 1 2 3 4{/} |||`
    for (const paged of [false, true]) {
      const pages = NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 320, paged, equalMeasures })
      if (paged) expect(pages.length).toBeGreaterThan(1)
      const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
      const systems = [...root.querySelectorAll('g.system')]
      expect(systems.length).toBeGreaterThan(2)
      systems.forEach((system, index) => {
        const brackets = [...system.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')]
        expect(brackets.map(node => node.textContent)).toEqual(index === 0 ? ['('] : index === systems.length - 1 ? [')'] : [])
        for (const bracket of brackets) {
          expect(Number(bracket.getAttribute('x'))).toBeGreaterThanOrEqual(32 - 0.1)
          const width = 24 * 0.58 // The deterministic non-browser text measurer.
          expect(Number(bracket.getAttribute('x')) + width).toBeLessThanOrEqual(288 + 0.1)
        }
      })
    }
  })

  it('keeps each separated passage enclosed and skips brackets at manual line breaks', () => {
    const source = '{4/4}\nN: {inst}1 2 3 4 | {br}1 2 3 4{/} | 1 2 3 4 | {inst}1 2 3 4{/} |||'
    const pages = NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 800, paged: false })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    expect([...root.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')].map(node => node.textContent).sort()).toEqual(['(', '(', ')', ')'])
    expect(root.querySelector('g.system')!.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')).toHaveLength(1)
  })

  it('reserves no enclosure space inside a passage, including split measures', () => {
    const source = `{64/4}\nN: {inst}${Array(16).fill('1 2 3 4').join(' ')}{/} |||`
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 320, paged: false })
    expect(layout.systems.length).toBeGreaterThan(2)
    const glyphs = layout.projection.glyphs
    glyphs.forEach((glyph, index) => {
      expect(glyph.parenthesisLeft! > 0).toBe(index === 0)
      expect(glyph.parenthesisRight! > 0).toBe(index === glyphs.length - 1)
    })
    const root = new DOMParser().parseFromString(NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 320, paged: false }).join(''), 'text/html')
    expect([...root.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')].map(node => node.textContent)).toEqual(['(', ')'])
  })
})
