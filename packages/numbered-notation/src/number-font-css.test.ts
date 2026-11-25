import { expect, it, vi } from 'vitest'

vi.mock('./font-family.js', () => ({ SCORE_NUMBER_FONT: 'Configured Score Numbers' }))

import { numberFontCss } from './number-font-css.js'

it('uses the configured number family for standalone SVG while preserving font bytes', () => {
  expect(numberFontCss).toContain("font-family: 'Configured Score Numbers'")
  expect(numberFontCss).toMatch(/src:url\(data:font\/ttf;base64,[A-Za-z0-9+/=]+\)/)
})
