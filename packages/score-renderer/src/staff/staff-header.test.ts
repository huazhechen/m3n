// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation'
import { expect, it, vi } from 'vitest'
import { staffHeader } from './staff-header.js'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { SvgGeometry, findAll, textContent, textMeasurer, xml } from './layout-svg.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

it.each([320, 720])('merges identical lyricist and composer in the staff header at %s px', width => {
  const score = parseM3NDocument('{title=喜欢你}{singer=陈洁仪}{lyricist=梁文福}{composer=梁文福}\nN: 1 2 3 4 |||')
  const holder = document.createElement('div')
  holder.innerHTML = `<svg>${xml(staffHeader(score, width, textMeasurer()).node)}</svg>`
  const texts = [...holder.querySelectorAll('text')].map(node => node.textContent)
  expect(texts.filter(text => text === '梁文福 词曲')).toHaveLength(1)
  expect(texts).not.toContain('梁文福 作词')
  expect(texts).not.toContain('梁文福 作曲')
  expect(texts).toContain('陈洁仪 演唱')
})

it('repositions shared header blocks with N, reusing text metrics and ignoring S', () => {
  const score = { ...parseM3NDocument('N: 1 2 3 4 |||'), title: 'Title', subtitle: 'Subtitle' }
  const measure = vi.fn((value: string, size: number) => ({ width: value.length * size / 2,
    left: 0, right: value.length * size / 2, ascent: size * .8, descent: size * .2 }))
  const header = staffHeader(score, 720, measure)
  const gapAt = (gap: number) => {
    const { node } = header.atRowGap(gap), geometry = new SvgGeometry(node, measure)
    const title = findAll(node, child => child.tagName === 'text' && textContent(child) === 'Title')[0]!
    const subtitle = findAll(node, child => child.tagName === 'text' && textContent(child) === 'Subtitle')[0]!
    return geometry.ink(subtitle).top - geometry.ink(title).bottom
  }
  expect(gapAt(18)).toBeCloseTo(6)
  expect(gapAt(36)).toBeCloseTo(12)
  const before = measure.mock.calls.length
  header.atRowGap(27)
  expect(measure.mock.calls.length).toBe(before)
  const previous = scoreLayoutConfig.staff.space
  try {
    const original = xml(header.atRowGap(27).node)
    scoreLayoutConfig.staff.space = 9
    expect(xml(header.atRowGap(27).node)).toBe(original)
  } finally { scoreLayoutConfig.staff.space = previous }
})
