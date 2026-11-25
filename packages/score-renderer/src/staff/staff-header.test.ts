// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation'
import { expect, it, vi } from 'vitest'
import { staffHeader } from './staff-header.js'
import { textMeasurer, xml } from './layout-svg.js'

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
