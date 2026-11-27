// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { element, nodes, readXml, setNumericPath, SvgGeometry, xml } from './layout-svg.js'
import { staffCommandPath, staffLinePath, staffLineInk } from './staff-glyph-primitive.js'
const measure = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
describe('numeric music primitives', () => {
  it('collects bounds directly with identical absolute rounding and stroke expansion', () => {
    let seed = 9347
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32
    for (let i = 0; i < 600; i++) {
      const points = Array.from({ length: 4 }, () => i < 200 ? (Math.floor(random() * 100) - 50 + .5) / 1000 : random() * 2000 - 1000)
      const [x1, y1, x2, y2] = points as [number, number, number, number], half = random()
      const box = staffLinePath(x1, y1, x2, y2).boxes[0]!
      expect(staffLineInk(x1, y1, x2, y2, half)).toEqual({ left: box.left - half, right: box.right + half,
        top: box.top - half, bottom: box.bottom + half })
    }
  })
  it('matches general line paths exactly before and after placement', () => {
    for (const [x1, y1, x2, y2] of [[0, 0, 123.456789, 0], [-1.0005, 2.9995, 1.234567, -0.00001], [5, 20, 5, -30]]) {
      const specialized = staffLinePath(x1!, y1!, x2!, y2!)
      const general = staffCommandPath([{ kind: 0, values: [x1!, y1!] }, { kind: 1, values: [x2!, y2!] }])
      for (const [x, y] of [[0, 0], [12.0005, -130.9999]]) {
        const actual = specialized.place(x!, y!), expected = general.place(x!, y!)
        expect(actual.boxes).toEqual(expected.boxes)
        expect(actual.end).toEqual(expected.end)
        expect(actual.text()).toBe(expected.text())
      }
    }
  })
  it('reuses only an identical absolute axis across repeated placements', () => {
    const primitive = staffCommandPath([
      { kind: 0, values: [-1.333333, 2.666666] },
      { kind: 3, values: [-8.22222, 10.77777, 11.12345, -4.99995, 20.333333, 1] },
      { kind: 2, values: [10.333333, -20.44444, 1, 2] }, { kind: 4, values: [] },
    ])
    for (const y of [0, 130, -5.123456, 130, 0]) for (const x of [-13.33333, 0, 49.99995, 123.45678]) {
      const root = element('path', { stroke: 'none' }); setNumericPath(root, primitive.place(x, y))
      const parsed = readXml(xml(root))
      expect(new SvgGeometry(root, measure).pieces(root)).toEqual(new SvgGeometry(parsed, measure).pieces(parsed))
    }
  })
  it('keeps separate closed line subpaths and post-close segments exact', () => {
    const primitive = staffCommandPath([
      { kind: 0, values: [0, 2] }, { kind: 1, values: [4, -5] }, { kind: 1, values: [10, 1] },
      { kind: 4, values: [] }, { kind: 1, values: [-3, 0] },
      { kind: 0, values: [20, 9] }, { kind: 1, values: [19, 10] }, { kind: 4, values: [] },
    ]).place(-0.12345, 130.33333)
    const root = element('path', { stroke: '#000', 'stroke-width': '1.5' }); setNumericPath(root, primitive)
    const parsed = readXml(xml(root))
    expect(new SvgGeometry(root, measure).pieces(root)).toEqual(new SvgGeometry(parsed, measure).pieces(parsed))
  })
  it('does not materialize paths during geometry queries, and invalidates after direct replacement', () => {
    const primitive = staffCommandPath([{ kind: 0, values: [0, 0] }, { kind: 1, values: [10, 20] }])
    let reads = 0
    const root = element('path', { stroke: 'none' })
    setNumericPath(root, { ...primitive, text() { reads++; return primitive.text() } })
    const geometry = new SvgGeometry(root, measure)
    expect(geometry.ink(root)).toEqual({ left: 0, right: 10, top: 0, bottom: 20 })
    expect(reads).toBe(0)
    expect(xml(root)).toContain('M0 0L10 20')
    expect(reads).toBe(1)
    root.attributes.d = 'M-10 -20L-5 -3'
    expect(geometry.ink(root)).toEqual({ left: -10, right: -5, top: -20, bottom: -3 })
  })
  it('places recorded curves and closed subpaths before rounding and serialization', () => {
    const path = staffCommandPath([
      { kind: 0, values: [1.123456, 2] }, { kind: 3, values: [3, 12, 14, -10, 20, 0] },
      { kind: 4, values: [] }, { kind: 1, values: [-2, -3] },
    ]).place(7.33333, 11.55555)
    const node = element('path', { stroke: 'none' }); setNumericPath(node, path)
    const parsed = readXml(xml(node))
    expect(new SvgGeometry(node, measure).pieces(node)).toEqual(new SvgGeometry(parsed, measure).pieces(parsed))
    expect(nodes(element('g', {}, [node]))).toHaveLength(1)
  })
})
