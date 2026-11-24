import { describe, expect, it, vi } from 'vitest'
import { element, readXml, SvgGeometry, textContent, xml } from './layout-svg.js'
import { staffLyricDrawing, type StaffLyricText } from './staff-lyric-drawing.js'

const measure = (text: string, size: number) => ({ width: text.length * size * 0.51, left: -1.1, right: text.length * size * 0.51 - 0.7, ascent: size * 0.77, descent: size * 0.21 })
describe('numeric lyric drawing', () => {
  it('shares fixed lyric metrics only in the supplied task, retaining raw underline width', () => {
    const templates = new Map<string, StaffLyricText>(), measured = vi.fn(measure)
    const plain = staffLyricDrawing(' 春 ', 10, 20, false, measured, templates)
    const repeated = staffLyricDrawing(' 春 ', 40, 70, false, measured, templates)
    expect(measured).toHaveBeenCalledTimes(1)
    const underlined = staffLyricDrawing(' 春 ', 40, 70, true, measured, templates)
    expect(measured).toHaveBeenCalledTimes(2)
    expect(measured.mock.calls.map(call => call[0])).toEqual(['春', ' 春 '])
    expect(xml(plain)).not.toContain('<path')
    expect(xml(repeated)).not.toContain('<path')
    const parsed = readXml(xml(underlined))
    expect(new SvgGeometry(underlined, measure).pieces(underlined)).toEqual(new SvgGeometry(parsed, measure).pieces(parsed))
    staffLyricDrawing(' 春 ', 40, 70, false, measured, new Map())
    expect(measured).toHaveBeenCalledTimes(3)
  })
  it.each(['春夏秋冬', '  repeated words  ', 'a\tb\nc', '_', '\u200B\u2800', ''])('matches the rendered text and underline ink: %s', value => {
    for (const underlined of [false, true]) {
      const lyric = staffLyricDrawing(value, 63.12345, 145.6789, underlined, measure)
      const node = element('g', { transform: 'translate(7 11) scale(0.7)' }, [lyric])
      const parsed = readXml(xml(node))
      expect(textContent(node)).toBe(value)
      expect(new SvgGeometry(node, measure).pieces(node)).toEqual(new SvgGeometry(parsed, measure).pieces(parsed))
    }
  })
})
