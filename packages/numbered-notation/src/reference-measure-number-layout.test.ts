// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import { renderInteractivePages } from './svg.js'
import { parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore } from './score.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'

const settings = [320, 800].flatMap(width => [false, true].map(paged => ({ width, paged })))
describe('visible row-end measure numbers', () => {
  it.each(settings)('does not measure hidden interior labels at $width, paged=$paged', options => {
    const fallback = new DefaultTextMeasurer()
    let hiddenMeasurements = 0
    const textMeasurer: TextMeasurer = { measureText(text, style) {
      if (style.fontSize === 10 && text === '1') {
        hiddenMeasurements++
        return { w: 6, h: 80, baseline: 60 }
      }
      return fallback.measureText(text, style)
    } }
    const pages = NumberedNotationScore.create(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | 5 6 7 1e{/} |')).render({ ...options, pageMargin: 11, textMeasurer, measureNumbers: true })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    expect([...root.querySelectorAll('[data-m3n-role="measure-number"]')].map(node => node.textContent)).toEqual(['2'])
    expect(hiddenMeasurements).toBe(0)
  })

  it('keeps an outgoing number on the closing bar when a shared repeat starts the next row', () => {
    const textMeasurer = new DefaultTextMeasurer()
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :||')
    const projection = projectNumberedScore(document, { width: 800, paged: false, measureNumbers: true,
      numberedMeasures: new Set(['m3n-measure-1-1', 'm3n-measure-1-2']) })
    const compiled = compileScore(projection.source, { autoWrap: true, textMeasurer })
    const root = new DOMParser().parseFromString(renderInteractivePages(compiled, projection).join(''), 'text/html')
    const systems = [...root.querySelectorAll('g.system')].filter(system => system.querySelector('g.note'))
    expect(systems).toHaveLength(2)
    expect(systems.map(system => [...system.querySelectorAll('[data-m3n-role="measure-number"]')].map(node => node.textContent))).toEqual([['1'], ['2']])
  })

  it.each(settings)('centers the whole two-digit number on its visible bar at $width, paged=$paged', options => {
    const textMeasurer = new DefaultTextMeasurer()
    const source = '{4/4}\nN: ' + Array(12).fill('1 2 3 4 |').join(' ')
    const pages = NumberedNotationScore.create(parseM3NDocument(source)).render({ ...options, pageMargin: 11, textMeasurer, measureNumbers: true })
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
    const label = [...root.querySelectorAll('[data-m3n-role="measure-number"]')].find(node => node.textContent === '12')!
    expect(label).toBeDefined()
    const bar = label.closest('g.measure')!.querySelector('rect[height="27.5"]')!
    expect(bar).not.toBeNull()
    const ink = nativeSvgInk(label.outerHTML, textMeasurer)
    expect((ink.left + ink.right) / 2).toBeCloseTo(Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2, 4)
  })
})
