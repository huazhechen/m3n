// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeHeaderGeometry } from './native-header.js'
import { nativeSvgInk } from './native-ink.js'
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
      expect(geometry.height - without.height).toBeCloseTo(2 * (23 + gap), 12)
      expect(geometry.orderRows[0]!.top - geometry.sidesBottom).toBeCloseTo(gap, 12)
      expect(geometry.orderRows[1]!.top - geometry.orderRows[0]!.top).toBeCloseTo(23 + gap, 12)
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


it('places each right credit row with the shared five-design-pixel ink clearance', () => {
  const doc = { ...parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), lyricist: '甲', composer: '乙', origin: '来源' }
  const varied = { measureText(text: string, style: { fontSize: number }) {
    return { w: text.length * style.fontSize, h: text.includes('作曲') ? 21 : 11, baseline: 8 }
  } }
  const geometry = nativeHeaderGeometry(doc, 800, 32, varied)
  const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml')
  const credits = [...root.querySelectorAll('text[text-anchor="end"]')].map(text => {
    const ink = nativeSvgInk(text.outerHTML, varied)
    const y = Number(text.parentElement!.getAttribute('transform')!.match(/translate\(0 ([^)]+)\)/)![1])
    return { top: ink.top + y, bottom: ink.bottom + y }
  })
  expect(credits).toHaveLength(3)
  for (let i = 1; i < credits.length; i++) expect(credits[i]!.top - credits[i - 1]!.bottom).toBeCloseTo(5, 4)
})

it('aligns range numerals and separator to the measured music axis', () => {
  const doc = parseM3NDocument('{4/4}\nN: 1 2 3 5 |||')
  const varied = { measureText(text: string, style: { fontSize: number }) {
    const h = text === '~' ? 4 : style.fontSize * 0.7
    return { w: text.length * style.fontSize * 0.6, h, baseline: text === '~' ? 7 : h * 0.9 }
  } }
  const geometry = nativeHeaderGeometry(doc, 800, 32, varied)
  const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml')
  const parts = [...root.querySelector('[data-m3n-role="pitch-range"]')!.children]
  expect(parts).toHaveLength(3)
  const zero = varied.measureText('0', { fontSize: 22 }), axis = zero.h / 2 - zero.baseline
  for (const part of parts) {
    const ink = nativeSvgInk(part.outerHTML, varied)
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(axis, 4)
  }
})

it('reserves a complete numeral body for narrow range digits', () => {
  const varied = { measureText(text: string, style: { fontSize: number }) {
    const advance = style.fontSize * 0.6 * text.length
    const width = text === '1' ? advance / 3 : advance
    return { w: advance, advance, inkLeft: 0, inkRight: width, h: style.fontSize * 0.7,
      baseline: style.fontSize * 0.7, centerOffset: (width - advance) / 2 }
  } }
  const separators = ['1', '2'].map(low => {
    const geometry = nativeHeaderGeometry(parseM3NDocument(`{2/4}\nN: ${low} 5 |||`), 800, 32, varied)
    const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml')
    return root.querySelector('[data-m3n-role="pitch-range"]')!.children[1]!.getAttribute('transform')
  })
  expect(separators[0]).toBe(separators[1])
})
