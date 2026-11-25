// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'

it.each([320, 800].flatMap(width => [false, true].flatMap(paged => [3, 123456789].flatMap(count => ['', '{6/8}'].map(control => ({ width, paged, count, control }))))))(
  'starts a new ending over its multi-rest cap at $width, paged=$paged, count=$count, control=$control',
  ({ width, paged, count, control }) => {
    const source = `{4/4}\nN: ||: 1 2 3 4 |{br}\n---V1\nN: ${control}{rest=${count}} :||\n---V2\nN: {4/4}1 2 3 4 |||`
    const layout = layoutNativeScore(parseM3NDocument(source), { width, paged })
    const system = layout.systems.find(system => system.voltas?.some(volta => volta.ending === '1'))!
    const fragment = system.voltas!.find(volta => volta.ending === '1')!
    const svg = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    const rest = svg.querySelector('[data-m3n-role="multi-rest"]')!
    const cap = [...rest.querySelectorAll('line')].find(line => line.getAttribute('x1') === line.getAttribute('x2'))!
    const paintedLeft = Number(cap.getAttribute('x1')) - Number(cap.getAttribute('stroke-width')) / 2
    expect(fragment.left).toBeCloseTo(paintedLeft, 5)
    const ending = new DOMParser().parseFromString(`<svg>${fragment.svg}</svg>`, 'image/svg+xml')
    expect(Number(ending.querySelector('text')!.getAttribute('x')) - paintedLeft).toBeCloseTo(24 * .15, 5)
  },
)
