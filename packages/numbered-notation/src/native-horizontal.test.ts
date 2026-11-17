import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { measureNativeHorizontal } from './native-horizontal.js'
import { projectNativeScore } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'

// Barlow advance widths with deterministic offline em-height estimates.
// inkBottom distinguishes that estimate's blank tail from a real descender.
// Ordinary prose is irrelevant to these examples' horizontal music positions.
const measurer: TextMeasurer = { measureText(text, style) { return { w: style.fontSize === 22 && text === '0' ? 11.154037475585938 : text.length * style.fontSize * 0.58, h: style.fontSize, baseline: style.fontSize * 0.8, inkBottom: style.fontSize * 0.8 } } }
const layout = (source: string, width = 800) => layoutNativeScore(parseM3NDocument(source), { width, paged: false, textMeasurer: measurer })

describe('native spacing and measured note envelopes', () => {
  it.each([
    '{3/4}\nN: (1 2) 3 4 |||\nB: ((1d 2d 3d 4d)) 5d 6d |',
    '{3/4}\nN: ((1 2 3 4)) 5 6 |||\nB: (1d 2d) 3d 4d |',
    '{3/4}{order=A,A,A}\n===A\nN: (1 2) 3 4 |||\nNs[2,3]: 1: ((1 2 3 4)) 5 6 |',
    '{4/4}{order=A,A,A}\n===A\nN: 4e (0 (3e 3e~)) 3e (0 3e) |||\nL1: 的心情清\nL2: 的心情清明\nL3: 的心情清明\nNs[2,3]: 1: 4e ((0 3e 2e 3e~)) 3e (0 3e) |',
  ])('retains each voice’s beam spacing when another voice inserts finer time columns: %s', source => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    const document = parseM3NDocument(source), options = {width:800, paged:false, textMeasurer:measurer}
    const native = layoutNativeScore(document, options), projection = projectNumberedScore(document, options)
    const reference = compileScore(projection.source, {textMeasurer:measurer, autoWrap:true, alignRelations:true, noteGap:13.2, minimumNoteGap:8.8})
    expect(reference.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    let checked = 0
    for (const note of reference.layout.objects.filter(node => node.T.toNumber() > 0)) {
      let ast: typeof note.ast | null = note.ast
      while (ast && !projection.bindings.has(ast.label ?? '')) ast = ast.parent
      const binding = ast && projection.bindings.get(ast.label!)
      if (!binding) continue
      const glyph = native.projection.glyphs.find(value => value.id === binding.visualId)!
      expect(glyph, binding.visualId).toBeDefined()
      expect(Math.abs(glyph.x - note.box.x - note.box.anchor), binding.visualId).toBeLessThan(.05)
      checked++
    }
    expect(checked).toBe(native.projection.glyphs.length)
  })

  it('matches all four note centres and the flush final bar of an unadorned system', () => {
    const result = layout('{4/4}\nN: 1 2 3 4 |||')
    const expected = [37.57701873779297, 217.293893737793, 397.01076873779297, 576.727643737793]
    result.projection.glyphs.forEach((glyph, index) => expect(glyph.x).toBeCloseTo(expected[index]!, 6))
    expect(result.projection.measures[0]!.barX).toBeCloseTo(763.17375, 6)
    expect(result.projection.glyphs[0]!.y).toBeCloseTo(106.36, 6)
  })
  it('reserves dots for dotted values and gives a plain eighth no phantom dot space', () => {
    const result = layout('{4/4}\nN: (1 2) 3. (4) 5 |||')
    const [eighth, , dotted] = result.projection.glyphs
    expect(eighth!.right).toBeCloseTo(5.577018737793, 6)
    expect(dotted!.right).toBeCloseTo(11.517018737793, 6)
  })
  it('reserves accidentals on the left of the number without widening its right edge', () => {
    const result = layout('{4/4}\nN: 1# 2 3 4 |||')
    const first = result.projection.glyphs[0]!
    expect(first.left).toBeCloseTo(13.08341873779297, 6)
    expect(first.right).toBeCloseTo(5.577018737793, 6)
  })
  it('fits stacked chord tones by their actual octave-dot envelopes', () => {
    const result = layout('{4/4}\nN: 1 2 3 4 |||\nB: [1d3d5d:h]^^ |||')
    const bass = result.projection.glyphs.find(glyph => glyph.staff === 'bass')!
    bass.pitchOffsets!.forEach((offset, index) => expect(offset).toBeCloseTo([0, -26.18, -52.36][index]!, 6))
    const lanes = result.systems[0]!.lanes
    expect(lanes[1]!.y - lanes[0]!.y).toBeCloseTo(97.735, 6)
  })
  it('keeps a beamed eighth rest in the shared spacing group in 虫儿飞', () => {
    const source = readFileSync(new URL('../../../src/scores/chong_er_fei_01.m3n', import.meta.url), 'utf8')
    const result = layout(source)
    const rest = result.projection.glyphs.find(glyph => glyph.id === 'm3n-e-44')!
    const next = result.projection.glyphs.find(glyph => glyph.id === 'm3n-e-45')!
    const projection = projectNumberedScore(parseM3NDocument(source), { width: 800, paged: false, textMeasurer: measurer })
    const reference = compileScore(projection.source, { textMeasurer: measurer, autoWrap: true, alignRelations: true, noteGap: 13.2, minimumNoteGap: 8.8, minimumNoteGapFloor: 2.2 })
    expect(reference.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    for (const glyph of [rest, next]) {
      const node = reference.layout.objects.find(note => {
        let ast: typeof note.ast | null = note.ast
        while (ast && !projection.bindings.has(ast.label ?? '')) ast = ast.parent
        return ast && projection.bindings.get(ast.label!)?.visualId === glyph.id
      })!
      expect(node).toBeDefined()
      expect(glyph.x).toBeCloseTo(node.box.x + node.box.anchor, 1)
    }
  })

  it('uses the cross-system tie height without adding 1.1px to each successive row', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/chong_er_fei_01.m3n', import.meta.url), 'utf8'), 600)
    const axes = result.systems.map(system => system.lanes[0]!.y)
    expect(axes).toHaveLength(4)
    for (const [index, gap] of [50.51, 47.54, 47.54].entries()) expect(axes[index + 1]! - axes[index]!).toBeCloseTo(gap, 1)
    expect(result.pages[0]!.height).toBeCloseTo(328.10, 1)
  })

  it('counts the shared voice connector once when breaking 欢乐颂 at 600px', () => {
    const result = layout(readFileSync(new URL('../../../src/examples/huan_le_song.m3n', import.meta.url), 'utf8'), 600)
    expect(result.systems.map(system => system.measures.length)).toEqual([4, 4, 4, 5])
  })

  it('counts the repeat opening once across a section boundary', () => {
    // Keep this regression independent of song edits that remove local repeats.
    const source = '{4/4}\nN: ' + Array(9).fill('(5 6) 6~ 6^ |').join(' ')
      + '\n---\nN: ||: 0 0 (0 3) (6 7) | (1e 3) (1e 7~) (7 6) (5 6~) |'
    const result = layout(source)
    const boundary = result.projection.measures[8]!
    expect(boundary.naturalEnd! - boundary.naturalStart!).toBeCloseTo(102.72057272681, 5)
    const opening = result.projection.measures[9]!
    expect(opening.naturalEnd! - opening.naturalStart!).toBeCloseTo(187.64324862417, 5)
    expect(result.systems.map(system => system.measures.length)).toEqual([6, 5])
  })

  it('balances dense bars and keeps equally scored short rows last in narrow 卡农', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/canon_01.m3n', import.meta.url), 'utf8'), 320)
    expect(result.systems).toHaveLength(53)
    expect(result.systems.slice(-5).map(system => system.measures.map(measure => measure.index + 1)))
      .toEqual([[53, 54], [55, 56], [57, 58], [59], [60, 61]])
  })

  it('lets wide lyrics share the minimum note clearance instead of accumulating it', () => {
    const textMeasurer: TextMeasurer = { measureText(text, style) {
      return { w: text === '0' ? 11.154 : [...text].length * 20, h: style.fontSize, baseline: style.fontSize * 0.8 }
    } }
    const measure = (count: number) => {
      const document = parseM3NDocument(`{4/4}\nN: ${Array(count).fill('1').join(' ')} |||\nL: ${Array(count).fill('(春风)').join(' ')}`)
      const projection = projectNativeScore(document, { textMeasurer })
      measureNativeHorizontal(projection.measures, { noteGapEm: 0.6, minimumNoteGapEm: 0.4 })
      return projection.measures[0]!
    }
    const two = measure(2), three = measure(3)
    // Each underlined syllable needs 20px plus a 0.4px stroke envelope
    // on either side, plus 1px safety. The
    // remaining elastic margin is 2.2px; the reserved 4.4px fits inside it.
    expect(three.natural - two.natural).toBeCloseTo(2 * (20.4 + 1 + 2.2), 5)
    expect(three.minimum - two.minimum).toBeCloseTo(2 * (20.4 + 1), 5)
  })

  it.each(['before', 'after'])('measures each forced row independently of adjacent springs (%s break)', kind => {
    const phrase = '||: 1 2 3 4 | 5 6 7 1e :||'
    const document = parseM3NDocument(`{4/4}\nN: 1 2 3 4 | ${phrase}`)
    const measures = [...document.parts.values()][0]!.melody
    if (kind === 'before') measures[1]!.breakBefore = true
    else measures[0]!.breakAfter = true
    const combined = layoutNativeScore(document, {width:800,paged:false,textMeasurer:measurer})
    const isolated = layout(`{4/4}\nN: ${phrase}`)
    for (const [index, expected] of isolated.projection.measures.entries()) {
      const actual = combined.projection.measures[index + 1]!
      expect(actual.natural).toBeCloseTo(expected.natural, 8)
      expect(actual.minimum).toBeCloseTo(expected.minimum, 8)
      expect(actual.naturalStart).toBeCloseTo(expected.naturalStart!, 8)
      expect(actual.minimumStart).toBeCloseTo(expected.minimumStart!, 8)
    }
  })

  it('places the measured section frame before its repeat opening', () => {
    const result = layout('{4/4}\n===Intro\nN: ||: 1 2 3 4 :||')
    const measure = result.projection.measures[0]!, first = result.projection.glyphs[0]!
    const heading = first.controls.find(control => control.kind === 'section')!
    expect(heading.x! + heading.width).toBeLessThan(measure.openingBarX!)
    expect(measure.openingBarX!).toBeLessThan(first.x - first.musicLeft!)
  })

})
