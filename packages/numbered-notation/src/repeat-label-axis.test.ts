// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation'
import { expect,it } from 'vitest'
import { NumberedNotationScore } from './index.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer,type TextMeasurer } from './native-measure.js'

it.each([3, 7, 12])('centers complete repeat count ×%s ink on its bar', count => {
  const fallback = new DefaultTextMeasurer()
  const textMeasurer: TextMeasurer = { measureText(text, style) {
    return style.fontSize === 13 ? {w:[...text].length * 7,h:13,baseline:10,centerOffset:-2,inkLeft:-2,inkRight:[...text].length * 7 - 2} : fallback.measureText(text, style)
  } }
  const pages = NumberedNotationScore.create(parseM3NDocument(`{4/4}\nN: ||: 1 2 3 4 :|||{x${count}}`)).render({width:800,paged:false,textMeasurer})
  const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
  const label = root.querySelector('[data-m3n-role="repeat-count"]')!
  expect(label.textContent).toBe(`×${count}`)
  const bar = root.querySelector('[data-m3n-bar="rptend"] rect')!
  const ink = nativeSvgInk(label.outerHTML, textMeasurer)
  expect((ink.left + ink.right) / 2).toBeCloseTo(Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2, 4)
})
