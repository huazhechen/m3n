// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { numberedOrderLines } from './order-lines.js'

const measurer = new DefaultTextMeasurer()
const source = '{title=演奏顺序}{4/4}{order=A,B,C,B,D}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |\n===C\nN: 1 2 3 4 |\n===D\nN: 5 6 7 1e |||'

describe('native measured header order', () => {
  it.each([320, 800])('shares published line grouping and measures every frame at %spx', width => {
    const document = parseM3NDocument(source)
    const geometry = nativeHeaderGeometry(document, width, 32, measurer)
    expect(geometry.orderRows.map(row => row.items.filter(item => item.framed).map(item => item.text)))
      .toEqual(numberedOrderLines(document.order, width - 64))
    for (const row of geometry.orderRows) {
      expect(row.items[0]!.x).toBe(32)
      expect(row.height).toBe(23)
      for (const [index, item] of row.items.entries()) {
        if (index) expect(item.x - row.items[index - 1]!.x - row.items[index - 1]!.width).toBeCloseTo(4, 6)
        expect(item.baseline).toBeCloseTo(row.top + 16.3, 6)
        expect(item.x + item.width).toBeLessThanOrEqual(width - 32)
      }
    }
  })

  it('accounts for measured order rows and configured gaps exactly once', () => {
    const document = parseM3NDocument(source), plain = { ...document, order: undefined }
    for (const gap of [12, 24, 36]) {
      const geometry = nativeHeaderGeometry(document, 320, 32, measurer, gap)
      const without = nativeHeaderGeometry(plain, 320, 32, measurer, gap)
      expect(geometry.orderRows).toHaveLength(2)
      expect(geometry.height - without.height).toBe(2 * (23 + gap))
      expect(geometry.orderRows[0]!.top - geometry.sidesBottom).toBe(gap)
      expect(geometry.orderRows[1]!.top - geometry.orderRows[0]!.top).toBe(23 + gap)
    }
    const empty = nativeHeaderGeometry({ ...document, order: ['', ''] }, 320, 32, measurer)
    expect(empty.orderRows).toEqual([])
    expect(empty.height).toBe(nativeHeaderGeometry(plain, 320, 32, measurer).height)
  })

  it('paints every order label at its measured position and keeps the first music row below it', () => {
    const document = parseM3NDocument(source)
    const geometry = nativeHeaderGeometry(document, 320, 32, measurer)
    const pages = NativeNumberedNotationScore.create(document).render({ width: 320, paged: false })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    const labels = [...root.querySelectorAll('[data-m3n-role="order"]')]
    const items = geometry.orderRows.flatMap(row => row.items.filter(item => item.framed))
    expect(labels.map(label => label.textContent)).toEqual(['A', 'B', 'C', 'B', 'D'])
    labels.forEach((label, index) => {
      expect(Number(label.getAttribute('x'))).toBeCloseTo(items[index]!.x + 3.5, 4)
      expect(Number(label.getAttribute('y'))).toBeCloseTo(items[index]!.baseline, 4)
    })
    const first = layoutNativeScore(document, { width: 320, paged: false }).systems[0]!
    const last = geometry.orderRows.at(-1)!
    expect(first.top - last.top - last.height).toBeGreaterThanOrEqual(24)
  })

  it('adds a section gap between musical sections, without adding one after the header', () => {
    const layout = (source: string) => layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false })
    const plain = layout('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||')
    const sections = layout('{4/4}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |||')
    expect(sections.systems[0]!.top).toBe(plain.systems[0]!.top)
    expect(sections.systems[1]!.top - plain.systems[1]!.top).toBe(12)
  })
})
