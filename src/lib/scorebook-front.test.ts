// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it } from 'vitest'
import plan from '../../config/scorebook/editorial-plan.json'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { scorebookFrontPages } from './scorebook-front'

const descriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength')
beforeAll(() => Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', { configurable: true,
  value() { return [...(this.textContent ?? '')].reduce((sum: number, char: string) => sum + (char.codePointAt(0)! > 127 ? 1 : .55), 0) * Number(this.getAttribute('font-size')) } }))
afterAll(() => { if (descriptor) Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', descriptor); else Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength') })

it('balances the complete catalogue across two pages and measures leaders around long titles and page ranges', () => {
  const entries = plan.entries.map((entry, index) => ({ ...entry, musicStart: index * 3, pageCount: index % 3 === 0 ? 3 : 1 }))
  const pages = scorebookFrontPages({ ...plan, version: 'a1b2c3d' }, entries)
  expect(pages).toHaveLength(3)
  expect(pages[0].textContent).toContain('a1b2c3d')
  expect(pages.every(page => page.getAttribute('data-score-export-footer') === 'none')).toBe(true)
  const counts = pages.slice(1).map(svg => svg.querySelectorAll('[data-scorebook-leader]').length)
  expect(counts.reduce((a, b) => a + b)).toBe(entries.length)
  expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(3)
  const style = scoreLayoutConfig.scorebook
  for (const svg of pages.slice(1)) {
    expect(Number(svg.querySelector('a text')?.getAttribute('font-size'))).toBeGreaterThan(style.entryTitle)
    for (const line of svg.querySelectorAll('[data-scorebook-leader]')) {
      const segments = [...(line.getAttribute('d') ?? '').matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)/g)]
      const x1 = Number(segments[0][1]), x2 = Number(segments.at(-1)![3])
      expect(x2 - x1).toBeGreaterThan(0)
      expect(x1).toBeGreaterThanOrEqual(style.contentsLeft)
      expect(x2).toBeLessThanOrEqual(style.contentsLeft + style.columnStep + style.pageNumberOffset)
      expect(Number(segments[0][2])).toBeLessThan(plan.page.height - style.contentsBottomInset)
    }
    // Page labels use the final three front pages, including multi-page scores.
    for (const link of svg.querySelectorAll('a')) expect(link.getAttribute('href')).toMatch(/^https:\/\/score\.cheesefans\.com\/scores\//)
  }
  const texts = pages.slice(1).flatMap(svg => [...svg.querySelectorAll('a text')].map(text => text.textContent))
  expect(texts).toContain('4–6')
})
