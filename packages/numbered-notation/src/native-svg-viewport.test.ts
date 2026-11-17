// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'

it.each([320, 800].flatMap(width => [false, true].map(paged => ({width, paged}))))(
  'keeps measured layout and emits a stable viewport at $width, paged=$paged', options => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), options)
    const heights = layout.pages.map(page => page.height)
    const positions = layout.projection.glyphs.map(glyph => [glyph.x, glyph.y])
    for (const [index, svg] of renderNativePages(layout).entries()) {
      const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
      const height = Number(root.getAttribute('height'))
      const viewBox = root.getAttribute('viewBox')!.split(' ').map(Number)
      expect(height).toBe(options.paged ? heights[index]! : Math.ceil(heights[index]!))
      expect(viewBox[3]).toBe(height)
      expect(height).toBeGreaterThanOrEqual(heights[index]! - .000000501)
      expect(height - heights[index]!).toBeLessThan(1)
    }
    expect(layout.pages.map(page => page.height)).toEqual(heights)
    expect(layout.projection.glyphs.map(glyph => [glyph.x, glyph.y])).toEqual(positions)
  })
