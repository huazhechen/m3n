// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeLanePieces } from './native-lanes.js'
import { nativeHeaderGeometry } from './native-header.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
import { numberedOrderLines } from './order-lines.js'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import type { TextMeasurer } from './native-measure.js'
import { numberedHeadingLines } from './header-text.js'

const measurer = new DefaultTextMeasurer()
const source = '{title=演奏顺序}{4/4}{order=A,B,C,B,D}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |\n===C\nN: 1 2 3 4 |\n===D\nN: 5 6 7 1e |||'

describe('header text blocks in both implementations', () => {
  const characters = { measureText(text: string) { return { w: [...text].length } } }
  it('resets line width at explicit newlines and preserves requested blank lines', () => {
    expect(numberedHeadingLines('AB\nCD', 4, 1, characters)).toEqual(['AB', 'CD'])
    expect(numberedHeadingLines('AB\r\n\r\nCD\n', 4, 1, characters)).toEqual(['AB', '', 'CD', ''])
  })
  it('does not strand a short first word when the following word needs hard wrapping', () => {
    expect(numberedHeadingLines('A BCDEFGHIJ', 6, 1, characters)).toEqual(['A BCDE', 'FGHIJ'])
  })
  const varied: TextMeasurer = { measureText(text, style) {
    const measured = measurer.measureText(text, style)
    if (text === 'A') return { ...measured, h: 8, baseline: 5 }
    if (text === 'g') return { ...measured, h: 15, baseline: 8 }
    if (text === '深字') return { ...measured, h: 38, baseline: 34 }
    return measured
  } }
  it.each([
    { title: 'Title', subtitle: 'Subtitle', singer: 'Singer', width: 800 },
    { title: 'A\n深字', subtitle: 'A\ng', singer: '歌手', width: 320 },
    { title: 'A BCDEFGHIJKLMNO', subtitle: 'A long subtitle needing multiple lines', singer: '歌手', width: 220 },
    { title: '标题', subtitle: '长副标题需要在窄页面中自动折行并保持自己的基线间距', singer: '歌手', width: 160 },
  ])('paints matching measured blocks at $width px: $title', ({ title, subtitle, singer, width }) => {
    const document = { ...parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), title, subtitle, singer }
    const projection = projectNumberedScore(document, { width, paged: false, textMeasurer: varied })
    const reference = compileScore(projection.source, { textMeasurer: varied })
    const painter = new RecordingPainter()
    for (const node of reference.layout.objects) node.paint(painter)
    const expected = painter.commands.filter(command => command.kind === 'text' && command.style.fontFamily === 'serif')
      .map(command => ({ text: command.text, baseline: command.y, size: command.style.fontSize }))
    const native = nativeHeaderGeometry(document, width, 32, varied)
    const root = new DOMParser().parseFromString(`<svg>${native.svg}</svg>`, 'image/svg+xml').documentElement
    const actual = [...root.children].filter(node => node.tagName === 'text').map(node => ({
      text: node.textContent, baseline: Number(node.getAttribute('y')), size: Number(node.getAttribute('font-size')),
    }))
    expect(actual.map(item => item.text)).toEqual(expected.map(item => item.text))
    actual.forEach((item, index) => {
      expect(item.size).toBe(expected[index]!.size)
      expect(item.baseline).toBeCloseTo(expected[index]!.baseline, 4)
    })
  })
})

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
    expect(labels.map(label => label.parentElement!.getAttribute('data-m3n-order-index'))).toEqual(['0', '1', '2', '3', '4'])
    expect(labels.every(label => label.parentElement!.querySelector('rect'))).toBe(true)
    labels.forEach((label, index) => {
      expect(Number(label.getAttribute('x'))).toBeCloseTo(items[index]!.x + 3.5, 4)
      expect(Number(label.getAttribute('y'))).toBeCloseTo(items[index]!.baseline, 4)
    })
    const score = layoutNativeScore(document, { width: 320, paged: false })
    const first = score.systems[0]!
    const headerInk = nativeSvgPieces(score.pages[0]!.header!, score.measurer)
    const musicInk = nativeLanePieces(first, score.measurer).get(first.lanes[0]!.id)!
    let checked = 0
    for (const upper of headerInk) for (const lower of musicInk) {
      if (Math.min(upper.right, lower.right) <= Math.max(upper.left, lower.left)) continue
      expect(first.lanes[0]!.y + lower.top - upper.bottom).toBeGreaterThanOrEqual(12 - 1e-6)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('adds a section gap between musical sections, without adding one after the header', () => {
    const layout = (source: string) => layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false })
    const plain = layout('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||')
    const sections = layout('{4/4}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |||')
    const stride = (score: ReturnType<typeof layout>) => score.systems[1]!.lanes[0]!.y - score.systems[0]!.lanes[0]!.y
    expect(stride(sections) - stride(plain)).toBeCloseTo(12)
    // The first section has no extra 12px gap below the header. Its frame
    // changes the local ink clearance by only half a pixel.
    expect(Math.abs(sections.systems[0]!.lanes[0]!.y - plain.systems[0]!.lanes[0]!.y)).toBeLessThan(1)
  })

  it('preserves order-frame padding beyond measured left and right ink overhang', () => {
    const measured = { measureText() { return { w: 8.5, advance: 8.5, h: 11, baseline: 9, inkLeft: -3, inkRight: 13 }; } }
    const geometry = nativeHeaderGeometry(parseM3NDocument(source), 800, 32, measured)
    const item = geometry.orderRows[0]!.items.find(item => item.framed)!
    const root = new DOMParser().parseFromString(geometry.svg, 'text/html')
    const text = root.querySelector('[data-m3n-role="order"]')!
    const ink = nativeSvgInk(text.outerHTML, measured)
    expect(ink.left - item.x).toBeCloseTo(3.5, 4)
    expect(item.x + item.width - ink.right).toBeCloseTo(3.5, 4)
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
