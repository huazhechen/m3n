// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { cacheNativeHairpins, releaseNativeHairpins, nativeHairpinSegments } from './native-hairpin.js'
import { renderNativePages } from './native-svg.js'
import { nativeStyle } from './native-style.js'
import { nativeSvgInk } from './native-ink.js'

it('shares endpoint indexing across wedges without changing segment geometry', () => {
  const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {cresc}1 2 | {br}3 4{/} | {br}{decres}5 6 | {br}7 1e{/} |||'), {width:540,paged:true})
  const relations = layout.relations.filter(r => r.kind === 'cresc' || r.kind === 'decres')
  const expected = relations.map(r => nativeHairpinSegments(r, layout.systems))
  cacheNativeHairpins(layout.systems)
  try {
    relations.forEach((relation, index) => {
      const actual = nativeHairpinSegments(relation, layout.systems)
      expect(actual).toEqual(expected[index])
      expect(nativeHairpinSegments(relation, layout.systems)).toBe(actual)
    })
  } finally { releaseNativeHairpins(layout.systems) }
  expect(nativeHairpinSegments(relations[0]!, layout.systems)).toEqual(expected[0])
})

// Both wedge directions share one engraving for progress, painted bounds and
// SVG checks. Keep zero-margin and the historical 540/560px boundary inputs.
it.each([
  { width: 320, paged: false }, { width: 320, paged: true },
  { width: 540, paged: false }, { width: 560, paged: true },
  { width: 640, paged: false }, { width: 1000, paged: true },
])('continues hairpins with safe painted bounds at $width, paged=$paged', ({ width, paged }) => {
  for (const kind of ['cresc', 'decres'] as const) {
    const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {${kind}}1 2 | {br}3 4 | {br}5 6{/} |||`), { width, paged, pageMargin: 0 })
    const relation = layout.relations.find(relation => relation.kind === kind)!
    const segments = nativeHairpinSegments(relation, layout.systems)
    expect(segments).toHaveLength(3)
    expect(segments[0]!.startHalf).toBeCloseTo(kind === 'cresc' ? 0 : nativeStyle.music * .2, 9)
    expect(segments.at(-1)!.endHalf).toBeCloseTo(kind === 'cresc' ? nativeStyle.music * .2 : 0, 9)
    for (const [index, segment] of segments.entries()) {
      expect(segment.right).toBeGreaterThan(segment.left)
      expect(kind === 'cresc' ? segment.endHalf - segment.startHalf : segment.startHalf - segment.endHalf).toBeGreaterThan(0)
      if (index) expect(segment.startHalf).toBeCloseTo(segments[index - 1]!.endHalf, 9)
      const ink = nativeSvgInk(segment.system.relationLayout!.get(relation)!.svg, layout.measurer)
      expect(ink.left).toBeGreaterThanOrEqual(-1e-6)
      expect(ink.right).toBeLessThanOrEqual(width + 1e-6)
    }
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    const groups = [...root.querySelectorAll(`g[data-m3n-relation="${kind}"]`)]
    expect(groups).toHaveLength(3)
    const middle = [...groups[1]!.querySelectorAll('line')]
    expect(middle).toHaveLength(2)
    expect(Number(middle[0]!.getAttribute('y1'))).not.toBe(0)
    expect(Number(middle[1]!.getAttribute('y2'))).not.toBe(0)
  }
})

it('retains opening progress across an actual page boundary', () => {
  const source = '{2/4}\nN: {cresc}1 2 | '+Array(12).fill('{br}3 4 |').join(' ')+' {br}5 6{/} |||'
  const layout = layoutNativeScore(parseM3NDocument(source),{width:320,paged:true})
  expect(layout.pages.length).toBeGreaterThan(1)
  const relation = layout.relations.find(r => r.kind==='cresc')!
  const segments = nativeHairpinSegments(relation,layout.systems)
  const pageStart = segments.findIndex((segment,i) => i>0 && segment.system.page!==segments[i-1]!.system.page)
  expect(pageStart).toBeGreaterThan(0)
  expect(segments[pageStart]!.startHalf).toBeCloseTo(segments[pageStart-1]!.endHalf,9)
  expect(segments[pageStart]!.startHalf).toBeGreaterThan(0)
})

it.each(['1','1{ac(2 3)}','[1 3 5:h]'])('spans the complete measured host for a one-event hairpin: %s', note => {
  const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {cresc}${note}{/} 2 |||`),{width:800,paged:false})
  const relation = layout.relations.find(r => r.kind==='cresc')!
  expect(relation.first).toBe(relation.last)
  const segment = nativeHairpinSegments(relation,layout.systems)[0]!
  expect(segment.left).toBeLessThan(relation.first.x)
  expect(segment.right).toBeGreaterThan(relation.first.x)
  expect(segment.right-segment.left).toBeCloseTo(relation.first.musicLeft!+relation.first.musicRight!,8)
})

it('keeps adjacent independent hairpins separate', () => {
  const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {cresc}1 2{/} {cresc}3 4{/} |||'),{width:800,paged:false})
  const ranges = layout.relations.filter(r => r.kind==='cresc').map(r => nativeHairpinSegments(r,layout.systems)[0]!)
  expect(ranges).toHaveLength(2)
  expect(ranges[0]!.right).toBeLessThan(ranges[1]!.left)
  expect(ranges.every(range => range.startHalf===0)).toBe(true)
})
