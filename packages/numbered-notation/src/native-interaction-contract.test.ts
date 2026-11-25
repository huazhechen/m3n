// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { NativeNumberedNotationScore } from './native-score.js'

function render(source: string, options = {}) {
  const pages = NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 800, paged: false, ...options })
  return new DOMParser().parseFromString(pages.join(''), 'text/html')
}

it.each([320, 800].flatMap(width => [false, true].map(paged => ({ width, paged }))))(
  'includes preceding elastic space in measure interaction areas at $width, paged=$paged', options => {
    const root = render('{4/4}\nN: 1 2 3 4 | 5 6 7 1e | {br} 1 2 3 4 | 5 6 7 1e |||\nB: 1d^^ | 5d^^ | 1d^^ | 5d^^ |', options)
    let checked = 0
    for (const system of root.querySelectorAll('g.system')) {
      const measures = [...system.querySelectorAll('g.measure')]
      expect(Number(measures[0]!.getAttribute('data-m3n-measure-start'))).toBeGreaterThanOrEqual(0)
      for (let index = 1; index < measures.length; index++) {
        const bars = [...measures[index - 1]!.querySelectorAll('[data-m3n-role="bar"] rect')]
        const right = Math.max(...bars.map(bar => Number(bar.getAttribute('x')) + Number(bar.getAttribute('width'))))
        expect(Number(measures[index]!.getAttribute('data-m3n-measure-start'))).toBeCloseTo(right, 5)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  },
)

it.each([false, true])('keeps an opening repeat as its own interaction boundary, paged=%s', paged => {
  const root = render('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :|||', { paged })
  const second = root.querySelectorAll('g.measure')[1]!
  const bars = [...second.querySelectorAll('[data-m3n-role="bar"]')][0]!
  const left = Math.min(...[...bars.querySelectorAll('rect')].map(bar => Number(bar.getAttribute('x'))))
  expect(Number(second.getAttribute('data-m3n-measure-start'))).toBeCloseTo(left, 5)
})

it.each([
  { fixedDo: false, transpose: 0, low: '1', high: '7', dots: 1 },
  { fixedDo: true, transpose: 0, low: '2', high: '1', dots: 2 },
  { fixedDo: true, transpose: -2, low: '1', high: '7', dots: 1 },
])('exposes both range endpoints for fixed=$fixedDo, transpose=$transpose', options => {
  const root = render('{key=D}{4/4}\nN: 1d 2 3 7e |||\nB: 1dd^ 1dd^ |', options)
  const low = root.querySelector('[data-m3n-role="pitch-range-low"]')!
  const high = root.querySelector('[data-m3n-role="pitch-range-high"]')!
  expect(low).not.toBeNull()
  expect(high).not.toBeNull()
  expect(low.querySelector('text[font-family="Barlow Semi Condensed"]')?.textContent).toBe(options.low)
  expect(high.querySelector('text[font-family="Barlow Semi Condensed"]')?.textContent).toBe(options.high)
  expect(low.querySelectorAll('[data-m3n-role="music-dot"]')).toHaveLength(1)
  expect(high.querySelectorAll('[data-m3n-role="music-dot"]')).toHaveLength(options.dots)
  const bodyDot = root.querySelector('g.note circle[data-m3n-role="music-dot"]')!
  const bodyDigit = bodyDot.parentElement!.querySelector('text[font-family="Barlow Semi Condensed"]')!
  const bodyRatio = Number(bodyDot.getAttribute('r')) / Number(bodyDigit.getAttribute('font-size'))
  for (const endpoint of [low, high]) {
    const digit = endpoint.querySelector('text[font-family="Barlow Semi Condensed"]')!
    for (const dot of endpoint.querySelectorAll('[data-m3n-role="music-dot"]')) {
      expect(dot.tagName.toLowerCase()).toBe('circle')
      expect(Number(dot.getAttribute('r')) / Number(digit.getAttribute('font-size'))).toBeCloseTo(bodyRatio)
      expect(Number(dot.getAttribute('r')) * 2 / Number(digit.getAttribute('font-size'))).toBeCloseTo(.15)
    }
  }
})

it('omits range endpoints for a score containing only rests', () => {
  expect(render('{4/4}\nN: 0 0 0 0 |||').querySelectorAll('[data-m3n-role^="pitch-range"]')).toHaveLength(0)
})
