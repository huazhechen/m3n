import { balanceScorePageTail } from './page-tail.js'
import { interpolateScoreCoreGap } from './score-layout-policy.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { sortedNativeInkSeparation } from './native-ink-separation.js'
import type { NativeInk } from './native-ink.js'
export type NativePageBlock = { height: number; gapBefore?: number; baseline?: number; core?: { top: number; bottom: number }; coreGapScale?: number; ink?: readonly NativeInk[]; boundaryInk?: readonly NativeInk[] }
export type NativeBlockPosition = { page: number; top: number }
type ElasticOptions = { pageHeight: number; margin: number; gap: number; maxGap?: number; headerGap?: number }

/** Place measured blocks; elastic pages fit one core parameter after breaking. */
export function paginateNativeBlocks(blocks: readonly NativePageBlock[], options: {
  pageHeight: number; margin: number; gap: number; elastic?: boolean; maxGap?: number; headerGap?: number
}): { positions: NativeBlockPosition[]; heights: number[]; coreGaps?: number[] } {
  const { pageHeight, margin, gap } = options
  if (options.elastic) return prepareNativePagination(blocks)(options)
  const capacity = pageHeight - margin * 2
  const groups: { first: number; end: number }[] = []
  let first = 0, occupied = 0
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    if (!Number.isFinite(block.height) || block.height < 0) throw new Error('谱面块高度必须为非负有限数值。')
    if (block.height > capacity + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    const separation = index === first ? 0 : gap + (block.gapBefore ?? 0)
    if (occupied + separation + block.height > capacity + 1e-6 && index > first) {
      groups.push({ first, end: index }); first = index; occupied = block.height
    } else occupied += separation + block.height
  }
  if (first < blocks.length) groups.push({ first, end: blocks.length })
  const positions: NativeBlockPosition[] = [], heights: number[] = []
  groups.forEach((group, page) => {
    let top = margin
    for (let index = group.first; index < group.end; index++) {
      if (index > group.first) top += gap + (blocks[index]!.gapBefore ?? 0)
      positions[index] = { page, top }; top += blocks[index]!.height
    }
    heights[page] = pageHeight === Infinity ? top + margin : pageHeight
  })
  return { positions, heights }
}

/** Largest shared core parameter that fits; collisions may make height flat. */
export function fitNativeCoreGap(heightAt: (gap: number) => number, capacity: number, minimum = nativeCoreGap(), maximum = minimum * 1.1): number {
  if (heightAt(minimum) > capacity + 1e-6) throw new Error('最小核心行距下的谱面超出页面。')
  if (heightAt(maximum) <= capacity) return maximum
  let low = minimum, high = maximum
  for (let iteration = 0; iteration < 24; iteration++) {
    const middle = (low + high) / 2
    if (heightAt(middle) <= capacity) low = middle
    else high = middle
  }
  return low
}

/** One immutable horizontal layout: reuse normalized ink and pair constraints
 * across its spacing fit, paged output and continuous/shared-page probes. */
export function prepareNativePagination(blocks: readonly NativePageBlock[]) {
  const normalized = blocks.map((block, index) => {
    const axis = block.baseline ?? 0
    const ink = (block.ink ?? []).map(piece => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis })).sort((a, b) => a.left - b.left)
    // Overlay labels affect page edges without becoming inter-row obstacles.
    const boundaryInk = [...ink, ...(block.boundaryInk ?? []).map(piece => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis }))]
    const top = Math.min(0, ...boundaryInk.map(piece => piece.top)), lower = Math.max(0, ...boundaryInk.map(piece => piece.bottom))
    const core = block.core ? { top: block.core.top - axis, bottom: block.core.bottom - axis } : { top, bottom: lower }
    return { block, index, axis, ink, top, lower, core }
  })
  type Placed = typeof normalized[number] & { baseline: number }
  // Cache actual ink overlap constraints while trying different core values.
  // Each pair is measured once; fitting then evaluates scalar maxima only.
  const collisions = new Map<number, Map<number, number>>()
  const collisionDistance = (prior: Placed, item: typeof normalized[number]) => {
    let row = collisions.get(prior.index)
    if (!row) { row = new Map(); collisions.set(prior.index, row) }
    const cached = row.get(item.index)
    if (cached !== undefined) return cached
    const distance = sortedNativeInkSeparation(prior.ink, item.ink)
    row.set(item.index, distance)
    return distance
  }
  return ({ pageHeight, margin, gap, maxGap = gap, headerGap = nativeCoreGap() * .8 }: ElasticOptions) => {
    for (const item of normalized)
      if (item.lower - item.top > pageHeight - margin * 2 + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    const nextBaseline = (item: typeof normalized[number], placed: Placed[], coreGap: number) => {
      let baseline = margin - item.top
      const previous = placed.at(-1)
      if (previous) {
        // Header separation stays fixed as the music's core parameter changes.
        // Lyrics reduce the starting clearance, while retaining the same page
        // stretch ceiling. Interpolate each gap using the shared fit parameter.
        const musicGap = interpolateScoreCoreGap(gap, maxGap, coreGap, previous.block.coreGapScale)
        const separation = item.block.core && previous.block.core ? musicGap : headerGap
        baseline = Math.max(baseline, previous.baseline + previous.core.bottom - item.core.top + separation)
        for (const prior of placed) {
          const localGap = interpolateScoreCoreGap(gap, maxGap, coreGap, prior.block.coreGapScale)
          baseline = Math.max(baseline, prior.baseline + collisionDistance(prior, item) + localGap * nativeStyle.collisionGapRatio)
        }
        baseline += item.block.gapBefore ?? 0
      }
      return baseline
    }
    // Determine membership once using the minimum; fitting never moves a block
    // to another page or changes a line's horizontal layout.
    const groups: { first: number; end: number }[] = []
    let first = 0, placed: Placed[] = []
    normalized.forEach((item, index) => {
      let baseline = nextBaseline(item, placed, gap)
      if (placed.length && baseline + item.lower > pageHeight - margin + 1e-6) {
        groups.push({ first, end: index }); first = index; placed = []
        baseline = nextBaseline(item, placed, gap)
      }
      if (baseline + item.lower > pageHeight - margin + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
      placed.push({ ...item, baseline })
    })
    if (placed.length) groups.push({ first, end: normalized.length })
    const balanced = balanceScorePageTail(groups, (first, end) => {
      const current: Placed[] = []
      for (let index = first; index < end; index++) {
        const item = normalized[index]!, baseline = nextBaseline(item, current, gap)
        if (baseline + item.lower > pageHeight - margin + 1e-6) return false
        current.push({ ...item, baseline })
      }
      return true
    }, (first, end) => blocks.slice(first, end).filter(block => block.core).length,
    index => Boolean(blocks[index - 1]?.core))
    const positions: NativeBlockPosition[] = [], heights: number[] = [], coreGaps: number[] = []
    for (const [page, group] of balanced.entries()) {
      const arrange = (coreGap: number, publish = false) => {
        const current: Placed[] = []
        let bottom = margin
        for (let index = group.first; index < group.end; index++) {
          const item = normalized[index]!, baseline = nextBaseline(item, current, coreGap)
          current.push({ ...item, baseline }); bottom = Math.max(bottom, baseline + item.lower)
          if (publish) positions[index] = { page, top: baseline - item.axis }
        }
        return bottom + margin
      }
      const coreGap = Number.isFinite(pageHeight) && maxGap > gap ? fitNativeCoreGap(arrange, pageHeight, gap, maxGap) : gap
      const height = arrange(coreGap, true)
      coreGaps.push(coreGap); heights.push(Number.isFinite(pageHeight) ? pageHeight : height)
    }
    return { positions, heights, coreGaps }
  }
}
