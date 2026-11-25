import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLayoutQuality } from './native-quality.js'

it('reports page-bottom space independently of horizontal last-line space', () => {
  const score = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
  const narrow = nativeLayoutQuality(layoutNativeScore(score, { width: 576, paged: true, pageMargin: 32 }))
  const wide = nativeLayoutQuality(layoutNativeScore(score, { width: 768, paged: true, pageMargin: 32 }))
  expect(narrow.pageCount).toBe(1)
  expect(wide.pageCount).toBe(1)
  expect(narrow.lastLineSlack).toBeCloseTo(0)
  expect(wide.lastLineSlack).toBeCloseTo(0)
  expect(narrow.pageBottomSlack).toBeGreaterThan(.5)
  expect(wide.pageBottomSlack).toBeGreaterThan(narrow.pageBottomSlack)
})
