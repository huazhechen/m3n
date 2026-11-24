// @vitest-environment jsdom
import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'

const variants = [320, 800].flatMap(width => [false, true].map(paged => ({ width, paged })))
const examples = [
  ['{4/4}\nN: {8va}1 {8vb}2{/} 3e{/} 4 | {8vb}5d 6 7 1{/} |||',
    '{4/4}\nN: 1e 2 3ee 4 | 5dd 6d 7d 1d |||'],
  ['{2/4}\nN: {8va}[135:h] 2 | {br}3 4{/} |||\nB: {8vb}1d^ | 5d^{/} |||',
    '{2/4}\nN: [1e3e5e:h] 2e | {br}3e 4e |||\nB: 1dd^ | 5dd^ |||'],

]

describe('octave scopes are resolved once into pitch dots', () => {
  it.each(variants)('matches explicit pitch spelling at $width, paged=$paged', options => {
    for (const [scoped, explicit] of examples) {
      const a = parseM3NDocument(scoped!), b = parseM3NDocument(explicit!)
      const layout = layoutNativeScore(a, options), expected = layoutNativeScore(b, options)
      expect(layout.projection.glyphs.map(g => g.pitches)).toEqual(expected.projection.glyphs.map(g => g.pitches))
      expect(layout.projection.glyphs.map(g => [g.x, g.y])).toEqual(expected.projection.glyphs.map(g => [g.x, g.y]))
      expect(layout.pages.map(p => p.height)).toEqual(expected.pages.map(p => p.height))
      expect(layout.relations.map(r => r.kind)).toEqual(expected.relations.map(r => r.kind))
      const sourceBefore = structuredClone(a)
      const performanceBefore = compileScorePerformance(a)
      const svg = NativeNumberedNotationScore.create(a).render(options).join('')
      expect(svg).not.toMatch(/8v[ab]|stroke-dasharray/)
      expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('g.note [data-m3n-role="music-dot"]').length).toBeGreaterThan(0)
      expect(a).toEqual(sourceBefore)
      expect(compileScorePerformance(a)).toEqual(performanceBefore)
    }
  })
})
