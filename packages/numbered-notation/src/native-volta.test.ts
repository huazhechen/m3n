import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { placedNativeControlInk } from './native-controls.js'
import { nativeBarSvg, nativeMeasureBarPositions } from './native-bars.js'
import { nativeVoltaSvg } from './native-volta.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

const measurer: TextMeasurer = { measureText(text, style) {
  return { w: text.length * style.fontSize / 2, h: style.fontSize * .7, baseline: style.fontSize * .6, inkLeft: -2, inkRight: text.length * style.fontSize / 2 + 3 }
} }
const layout = (music: string, width = 800) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: ${music} :||\n---V2\nN: 1 2 3 4 |||`), { width, paged: false, textMeasurer: measurer })

describe('measured native volta fragments', () => {
  it.each([1.5, 2, 4])('centers the painted label independently of a nominal text box scaled by %s', nominalScale => {
    const measured: TextMeasurer = { measureText(text, style) {
      const metrics = measurer.measureText(text, style)
      return { ...metrics, h: metrics.h * nominalScale, inkBottom: metrics.h }
    } }
    const pieces = nativeSvgPieces(nativeVoltaSvg(10, 100, '1', measured), measured)
    const hook = pieces[1]!, label = pieces[2]!
    expect((label.top + label.bottom) / 2).toBeCloseTo((hook.top + hook.bottom) / 2, 4)
    // The label's measured ink, rather than its nominal box, sets both hooks.
    expect(hook.bottom - hook.top - 22 * .055).toBeCloseTo((label.bottom - label.top) * 1.2, 4)
  })

  it.each([[true, true, 4], [true, false, 3], [false, true, 2], [false, false, 1]])(
    'draws only the real endpoint hooks and first label: first=%s last=%s', (first, last, count) => {
      const svg = nativeVoltaSvg(10, 100, '3,1,2,1', measurer, first, last)
      const pieces = nativeSvgPieces(svg, measurer)
      expect(pieces).toHaveLength(count)
      expect(svg.includes('<text')).toBe(first)
      if (first) {
        expect(svg).toContain('font-family="M3N Numbers"')
        expect(svg).toContain('>1.2.3.</text>')
        const hook = pieces[1]!, text = pieces[2]!
        expect((text.top + text.bottom) / 2).toBeCloseTo((hook.top + hook.bottom) / 2, 4)
      } else if (!last) expect(pieces[0]!.bottom - pieces[0]!.top).toBeCloseTo(1.21, 4)
    })

  it.each([false, true])('keeps bar-owned counts below the ending and stacks measure numbers above counts, numbers=%s', measureNumbers => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ||: 1 2 3 4 |\n---V1,V3\nN: 1 2 3 4 :||{x4}{br}\n---V2,V4\nN: 1 2 3 4 |||'), { width: 800, paged: false, textMeasurer: measurer, measureNumbers })
    const system = score.systems[0]!, count = system.decorationLayout!.find(decoration => decoration.svg.includes('repeat-count'))!
    const countInk = nativeSvgInk(count.svg, measurer)
    expect(count.svg).toContain('font-size="13"')
    expect(count.svg).toContain('text-anchor="middle"')
    const first = system.voltas![0]!, firstInk = nativeSvgInk(first.svg, measurer)
    expect(firstInk.bottom).toBeLessThanOrEqual(countInk.top - 2 + .001)
    if (measureNumbers) {
      const number = system.decorationLayout!.find(decoration => decoration.svg.includes('>2</text>'))!
      expect(nativeSvgInk(number.svg, measurer).bottom).toBeLessThanOrEqual(countInk.top - 2.64 + .001)
    }
  })

  it('keeps the ending hook 2px above the bar and raises it for high notes', () => {
    const gap = (note: string) => {
      const score = layout(`${note} 2 3 4`), system = score.systems[0]!
      const fragment = system.voltas![0]!
      const index = system.measures.findIndex(measure => measure.source.ending === '1')
      const bar = nativeMeasureBarPositions(system.measures, index).at(-1)!
      return nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer).top - nativeSvgInk(fragment.svg, measurer).bottom
    }
    expect(gap('1')).toBeCloseTo(2, 4)
    expect(gap('1ee')).toBeCloseTo(2, 4)
    expect(gap('1eeeeee')).toBeGreaterThan(2)
  })

  it('shows one label and two hooks across forced system breaks', () => {
    const score = layout('1 2 3 4 | {br}1 2 3 4 | {br}1 2 3 4')
    const fragments = score.systems.flatMap(system => system.voltas ?? []).filter(volta => volta.ending === '1')
    expect(fragments).toHaveLength(3)
    expect(fragments.map(fragment => (fragment.svg.match(/<line/g) ?? []).length)).toEqual([2, 1, 2])
    expect(fragments.map(fragment => fragment.svg.includes('<text'))).toEqual([true, false, false])
    const middle = nativeSvgPieces(fragments[1]!.svg, measurer)
    expect(middle[0]!.bottom - middle[0]!.top).toBeCloseTo(1.21, 4)
  })

  it('anchors continuation fragments to the music body independently of lyric width', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: 1 2 3 4 | {br}1 2 3 4 :||\nL: 春春春春 | 春春春春\n---V2\nN: 1 2 3 4 |||'), { width: 800, paged: false, textMeasurer: measurer })
    const system = score.systems.find(system => system.index > 0 && system.voltas?.some(fragment => fragment.ending === '1'))!
    const first = system.measures[0]!.columns[0]!.glyphs[0]!
    expect(first.left).toBeGreaterThan(first.musicLeft!)
    const fragment = system.voltas!.find(fragment => fragment.ending === '1')!
    expect(first.x - fragment.left).toBeCloseTo(11 / 2, 4)
  })

  it('keeps adjacent ending tops aligned when one contains higher notes', () => {
    const score = layout('1ee 2 3 4')
    const peers = score.systems.flatMap(system => system.voltas ?? [])
    expect(peers).toHaveLength(2)
    expect(peers[0]!.top).toBeCloseTo(peers[1]!.top, 4)
  })

  it('keeps the label unique when one oversized ending measure is split', () => {
    const score = layout(`{64/4} ${Array(64).fill('1').join(' ')}`, 320)
    const fragments = score.systems.flatMap(system => system.voltas ?? []).filter(volta => volta.ending === '1')
    expect(fragments.length).toBeGreaterThan(2)
    expect(fragments.flatMap(fragment => fragment.svg.match(/<text/g) ?? [])).toHaveLength(1)
    expect(fragments.flatMap(fragment => [...fragment.svg.matchAll(/<line[^>]*x1="([^"]+)"[^>]*x2="([^"]+)"/g)].filter(match => match[1] === match[2]))).toHaveLength(2)
    const numbered = layoutNativeScore(score.document, { width: 320, paged: false, textMeasurer: measurer, measureNumbers: true })
    const owners = numbered.systems.filter(system => system.decorationLayout?.some(label => label.svg.includes('>2</text>')))
    expect(owners).toHaveLength(1)
    expect(owners[0]!.measures.some(measure => measure.source.ending === '1' && measure.lastFragment)).toBe(true)
  })

  it.each([320, 600, 800, 1000])('does not reserve an out-of-span meter above a split ending at %s', width => {
    const score = layout(`{64/4} ${Array(64).fill('1').join(' ')}`, width)
    const system = score.systems.find(system => system.voltas?.some(fragment => fragment.ending === '1'))!
    const fragment = system.voltas!.find(fragment => fragment.ending === '1')!
    const glyphs = system.measures.filter(measure => measure.source.ending === '1').flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    const meter = glyphs.flatMap(glyph => glyph.controls).find(control => control.kind === 'meter')!
    expect(meter.x! + meter.width).toBeLessThan(fragment.left)
    const musicTop = Math.max(...glyphs.map(glyph => glyph.musicTop!))
    expect(meter.top).toBeGreaterThan(musicTop)
    expect(nativeSvgInk(fragment.svg, measurer).bottom).toBeCloseTo(-musicTop - 2, 4)
  })

  it('still clears the painted meter when it lies inside the ending span', () => {
    const score = layout('1 2 3 4 | {8/4}1 2 3 4 5 6 7 1', 1000)
    const system = score.systems.find(system => system.voltas?.some(fragment => fragment.ending === '1'))!
    const fragment = system.voltas!.find(fragment => fragment.ending === '1')!
    const meter = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.flatMap(glyph => glyph.controls))).find(control => control.kind === 'meter')!
    expect(meter.x!).toBeGreaterThan(fragment.left)
    expect(meter.x! + meter.width).toBeLessThan(fragment.right)
    for (const mark of nativeSvgPieces(fragment.svg, measurer)) for (const obstacle of placedNativeControlInk(meter)) {
      if (mark.right <= obstacle.left || mark.left >= obstacle.right) continue
      expect(mark.bottom).toBeLessThanOrEqual(obstacle.top - 2 + .001)
    }
  })
})
