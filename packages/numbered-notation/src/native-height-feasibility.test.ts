import { expect, it } from 'vitest'
import { nativeWholeRowFeasibility } from './native-height-feasibility.js'
import { nativeEnvelopeBlock } from './native-height-envelope.js'
import { prepareNativePagination, type NativePageBlock } from './native-pagination.js'
import type { NativeLineCandidate } from './native-line-breaking.js'

it('matches exhaustive whole-row pagination including headers, lyrics, fixed gaps and asymmetric cores', () => {
  let seed = 37
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 100; trial++) {
    const count = 4 + trial % 4
    const graph: NativeLineCandidate[][] = Array.from({ length: count }, (_, start) =>
      Array.from({ length: Math.min(3, count - start) }, (_, index) => ({ end: start + index + 1, density: .5 })))
    const blocks = graph.map(rows => new Map(rows.map(row => {
      const block: NativePageBlock = nativeEnvelopeBlock({ coreAbove: 5 + random() * 20, coreBelow: 5 + random() * 30,
        extraAbove: random() * 20, extraBelow: random() * 20, hasLyrics: false }, 500, -9)
      block.coreGapScale = trial % 2 ? .7 : 1
      if (random() < .15) block.coreGapBefore = random() * 15
      block.gapBefore = random() < .2 ? 10 : 0
      return [row.end, block]
    })))
    const headers = [{ height: 30, ink: [{ left: 0, right: 100, top: 0, bottom: 30 }] }]
    const blockFor = (start: number, end: number) => blocks[start]!.get(end)!
    const options = { pageHeight: 160 + random() * 120, margin: 5, gap: 20, headerGap: 17, ratio: .3 }
    const feasible = nativeWholeRowFeasibility(graph, blockFor, headers, options)
    const restricted = graph.map(rows => rows.filter((_, index) => index === 0 || random() > .3))
    const paths = (start = 0): number[][] => start === count ? [[]] : restricted[start]!.flatMap(row =>
      paths(row.end).map(rest => [row.end, ...rest]))
    const minimumPages = Math.min(...paths().map(path => {
      let start = 0
      const music = path.map(end => { const block = blockFor(start, end); start = end; return block })
      return prepareNativePagination([...headers, ...music], { wholeRows: true, nonCoreGapRatio: .3 })(options).heights.length
    }))
    for (const ceiling of [1, 2, 3, 4]) expect(feasible(restricted, ceiling), String(trial)).toBe(minimumPages <= ceiling)
  }
})
