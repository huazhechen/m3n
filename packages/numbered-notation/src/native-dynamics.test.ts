// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { nativeDynamicGlyph } from './native-dynamics.js'
import { NativeSymbols } from './native-symbols.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativePathInk, nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'
import { layoutNativeScore } from './native-layout.js'

const measurer = new DefaultTextMeasurer()
const names = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'] as const

describe('native dynamic outlines', () => {
  it.each(names)('preserves every %s contour and its measured dimensions', name => {
    const result = compileScore(`@symbol(${name},size=${nativeStyle.small}px)`)
    const node = result.layout.objects[0]!, painter = new RecordingPainter()
    node.paint(painter)
    const svg = new NativeSymbols(measurer).rawMark(name)
    expect(svg).not.toContain('<text')
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
    const paths = [...root.querySelectorAll('path')]
    const commands = painter.commands.filter(command => command.kind === 'path')
    expect(paths).toHaveLength(commands.length)
    const ink = nativeSvgInk(svg, measurer)
    expect(ink.right - ink.left).toBeCloseTo(node.box.w, 4)
    expect(ink.bottom - ink.top).toBeCloseTo(node.box.h, 4)
    expect(ink.left + ink.right).toBeCloseTo(0, 4)
    paths.forEach((path, index) => {
      const outline = path.getAttribute('d')!, bounds = nativePathInk(outline)
      expect(bounds.top).toBeGreaterThanOrEqual(-.00001)
      const reference = commands[index]!.commands
      expect(outline.match(/[MLCZ]/g)).toEqual(reference.map(command => command.op))
      const expected = reference.flatMap(command => command.op === 'Z' ? [] : command.op === 'C'
        ? [command.cx1 - node.box.x - node.box.w / 2, command.cy1 - node.box.y, command.cx2 - node.box.x - node.box.w / 2, command.cy2 - node.box.y, command.x - node.box.x - node.box.w / 2, command.y - node.box.y]
        : 'x' in command ? [command.x - node.box.x - node.box.w / 2, command.y - node.box.y] : [])
      const actual = outline.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)!.map(Number)
      expect(actual).toHaveLength(expected.length)
      actual.forEach((value, coordinate) => expect(value).toBeCloseTo(expected[coordinate]!, 5))
    })
  })

  it('measures dynamics without consulting text fonts', () => {
    const painter = new NativeSymbols({ measureText() { throw new Error('Dynamic outlines are font independent') } })
    for (const name of names) expect(painter.rawMark(name)).toContain('<path')
  })

  it('scales every dynamic from the same measured outline at each music size', () => {
    for (const name of names) {
      const original = nativeDynamicGlyph(name, 12)!
      for (const size of [6, 12, 24]) {
        const glyph = nativeDynamicGlyph(name, size)!
        const ink = nativeSvgInk(glyph.paths.map(path => `<path d="${path}" fill="#000"/>`).join(''), measurer)
        expect(glyph.width).toBeCloseTo(original.width * size / 12, 5)
        expect(ink.right - ink.left).toBeCloseTo(glyph.width, 5)
        expect(ink.bottom - ink.top).toBeCloseTo(glyph.height, 5)
        expect(ink.left + ink.right).toBeCloseTo(0, 5)
        expect(glyph.height).toBeCloseTo(size * (name.includes('f') ? 1 : .79341), 5)
      }
    }
  })

  it('leaves non-dynamic marks to their own renderers', () => {
    for (const name of ['sfz', 'f1', 'tr', 'pppp', 'forte']) expect(nativeDynamicGlyph(name)).toBeUndefined()
  })

  it('uses the reference regular text style for the sfz expression', () => {
    const svg = new NativeSymbols(measurer).rawMark('sfz')
    expect(svg).toContain('font-size="13"')
    expect(svg).not.toContain('font-style="italic"')
  })

  it.each([320, 800])('keeps measured dynamic ink outside a tuplet and below its reserved system top at %s', width => {
    for (const name of names) for (const paged of [false, true]) {
      const score = layoutNativeScore(parseM3NDocument(`{4/4}\nN: {${name}} ([12b3=:2]) 4 5 6 |||`), { width, paged })
      const system = score.systems[0]!, relation = system.relations.find(item => item.kind === 'tuplet')!
      const glyph = relation.first, mark = glyph.markLayout!.find(item => item.name === name)!
      const ink = nativeSvgInk(new NativeSymbols(measurer).rawMark(name), measurer)
      expect(mark.height).toBeCloseTo(ink.bottom - ink.top, 4)
      expect(mark.top).toBeCloseTo(mark.y + ink.top, 4)
      expect(mark.top + mark.height).toBeLessThanOrEqual(system.relationLayout!.get(relation)!.ink.top - nativeStyle.markGap + .0001)
      expect(system.lanes[0]!.top).toBeGreaterThanOrEqual(-mark.top - .0001)
    }
  })
})
