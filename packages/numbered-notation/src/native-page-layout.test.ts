import { readFileSync } from 'node:fs'
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { nativeLayoutQuality } from './native-quality.js'

it('keeps exact pages, partitions, quality and SVG when reusing measured row envelopes', () => {
  for (const [name, width] of [['lao_nan_hai', 642], ['hei_se_you_mo', 720], ['bei_jia_er_hu_pan', 582], ['qing_niao', 600]] as const) {
    const source = readFileSync(new URL(`../../../src/scores/${name}_01.m3n`, import.meta.url), 'utf8')
    const document = parseM3NDocument(source)
    const options = { width, pageMargin: 0, paged: true, pageConstrainedBreaks: true }
    const cached = layoutNativeScore(document, options)
    const uncached = layoutNativeScore(document, { ...options, cachePageLineGeometry: false })
    expect(cached.pages.length, name).toBe(uncached.pages.length)
    expect(nativeLayoutQuality(cached), name).toEqual(nativeLayoutQuality(uncached))
    expect(renderNativePages(cached), name).toEqual(renderNativePages(uncached))
  }
})
