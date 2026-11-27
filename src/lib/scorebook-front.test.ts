// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it } from 'vitest'
import plan from '../../config/scorebook/editorial-plan.json'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { scorebookFrontPages } from './scorebook-front'

const descriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength')
beforeAll(() => Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', { configurable: true,
  value() { return [...(this.textContent ?? '')].reduce((sum: number, char: string) => sum + (char.codePointAt(0)! > 127 ? 1 : .55), 0) * Number(this.getAttribute('font-size')) } }))
afterAll(() => { if (descriptor) Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', descriptor); else Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength') })

it('balances whole chapters across two pages with independent columns and full-width ruled headings', () => {
  const entries = plan.entries.map((entry, index) => ({ ...entry, musicStart: index * 3, pageCount: index % 3 === 0 ? 3 : 1 }))
  const pages = scorebookFrontPages({ ...plan, version: 'a1b2c3d' }, entries)
  expect(pages).toHaveLength(3)
  expect(pages[0].textContent).toContain('a1b2c3d')
  expect(pages.every(page => page.getAttribute('data-score-export-footer') === 'none')).toBe(true)
  const counts = pages.slice(1).map(svg => svg.querySelectorAll('[data-scorebook-leader]').length)
  expect(counts.reduce((a, b) => a + b)).toBe(entries.length)
  expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(3)
  const style = scoreLayoutConfig.scorebook
  const headings = pages.slice(1).flatMap(svg => [...svg.querySelectorAll<SVGTextElement>('[data-scorebook-section]')])
  expect(headings.map(node => node.textContent)).toEqual(plan.sections.map(section => section.title))
  for (const section of plan.sections) {
    const heading = headings.find(node => node.getAttribute('data-scorebook-section') === section.id)!
    const svg = heading.ownerSVGElement!
    const center = style.contentsLeft + (style.columnStep + style.pageNumberOffset) / 2
    expect(heading.getAttribute('text-anchor')).toBe('middle')
    expect(Number(heading.getAttribute('x'))).toBe(center)
    const rule = svg.querySelector(`[data-scorebook-section-rule="${section.id}"]`)!
    const segments = [...rule.getAttribute('d')!.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)/g)]
    expect(segments).toHaveLength(2)
    expect(Number(segments[0][1])).toBe(style.contentsLeft)
    expect(Number(segments[0][3])).toBeLessThan(center)
    expect(Number(segments[1][1])).toBeGreaterThan(center)
    expect(Number(segments[1][3])).toBe(style.contentsLeft + style.columnStep + style.pageNumberOffset)
    const songs = entries.filter(entry => entry.section === section.id)
    const split = Math.ceil(songs.length / 2)
    const names = songs.map(entry => svg.querySelector(`a[href$="/${entry.file.replace(/\.m3n$/, '')}"] text`)!)
    expect(names.every(Boolean)).toBe(true)
    names.forEach((name, index) => {
      expect(Number(name.getAttribute('x'))).toBe(style.contentsLeft + (index < split ? 0 : style.columnStep))
      expect(Number(name.getAttribute('y'))).toBeGreaterThan(Number(heading.getAttribute('y')))
      if (index > 0 && index !== split) expect(Number(name.getAttribute('y'))).toBeGreaterThan(Number(names[index - 1].getAttribute('y')))
    })
    if (songs.length > 1) expect(names[0].getAttribute('y')).toBe(names[split].getAttribute('y'))
    const pageHeadings = [...svg.querySelectorAll('[data-scorebook-section]')]
    const next = pageHeadings[pageHeadings.indexOf(heading) + 1]
    if (next) expect(Math.max(...names.map(name => Number(name.getAttribute('y'))))).toBeLessThan(Number(next.getAttribute('y')))
  }
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

it('shrinks the font for a growing catalogue while retaining two pages and every song', () => {
  const entries = plan.entries.map((entry, index) => ({ ...entry, musicStart: index, pageCount: 1 }))
  const normal = scorebookFrontPages(plan, entries)
  const expanded = scorebookFrontPages(plan, Array.from({ length: 3 }, () => entries).flat())
  expect(expanded).toHaveLength(3)
  const size = (pages: SVGSVGElement[]) => Number(pages[1].querySelector('a text')!.getAttribute('font-size'))
  expect(size(expanded)).toBeLessThan(size(normal))
  expect(expanded.slice(1).reduce((sum, svg) => sum + svg.querySelectorAll('[data-scorebook-leader]').length, 0)).toBe(entries.length * 3)
  for (const svg of expanded.slice(1)) {
    for (const name of svg.querySelectorAll('a text')) {
      expect(Number(name.getAttribute('y'))).toBeLessThan(plan.page.height - scoreLayoutConfig.scorebook.contentsBottomInset)
    }
  }
})

it('fits unusually long chapter and song titles without losing rules or page-number leaders', () => {
  const longPlan = { ...plan, sections: [{ id: 'long', title: '章节名称'.repeat(30) }] }
  const pages = scorebookFrontPages(longPlan, [{ title: '很长的曲目名称'.repeat(25), section: 'long', musicStart: 0, pageCount: 10 }])
  expect(pages).toHaveLength(3)
  const svg = pages[1]
  const name = svg.querySelector<SVGTextElement>('a text')!
  const number = svg.querySelector<SVGTextElement>('a:nth-of-type(2) text')!
  const size = Number(name.getAttribute('font-size'))
  expect(Number(name.getAttribute('x')) + name.getComputedTextLength()).toBeLessThan(Number(number.getAttribute('x')) - number.getComputedTextLength() - size)
  const heading = svg.querySelector<SVGTextElement>('[data-scorebook-section]')!
  expect(heading.getComputedTextLength() + size * 4).toBeLessThanOrEqual(scoreLayoutConfig.scorebook.columnStep + scoreLayoutConfig.scorebook.pageNumberOffset)
  expect(svg.querySelector('[data-scorebook-leader]')!.getAttribute('d')).not.toBe('')
})
