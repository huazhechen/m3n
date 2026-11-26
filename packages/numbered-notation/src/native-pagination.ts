import { balanceScorePageTail } from './page-tail.js'
import { interpolateScoreCoreGap } from './score-layout-policy.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { sortedNativeInkSeparation } from './native-ink-separation.js'
import type { NativeInk } from './native-ink.js'
export type NativePageBlock = { resolvedInk?: boolean; height: number; coreGapBefore?: number; gapBefore?: number; baseline?: number; core?: { top: number; bottom: number }; coreGapScale?: number; ink?: readonly NativeInk[]; boundaryInk?: readonly NativeInk[] }
export type NativeBlockPosition = { page: number; top: number }
type ElasticOptions = { pageHeight: number; margin: number; gap: number; maxGap?: number; headerGap?: number }
type NormalizedBlock={block:NativePageBlock;axis:number;ink:NativeInk[];top:number;lower:number;core:{top:number;bottom:number};sortState:{sorted:boolean}}
const normalizedBlocks=new WeakMap<NativePageBlock,NormalizedBlock>()

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
export function prepareNativePagination(blocks: readonly NativePageBlock[], policy: { wholeRows?: boolean; nonCoreGapRatio?: number; immutableBlocks?:boolean } = {}) {
  const normalized = blocks.map((block, index) => {
    const saved=policy.immutableBlocks && normalizedBlocks.get(block)
    if(saved)return {...saved,index}
    const axis = block.baseline ?? 0
    const ink = (block.ink ?? []).map(piece => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis }))
    // Overlay labels affect page edges without becoming inter-row obstacles.
    let top=0,lower=0
    for(const piece of ink){top=Math.min(top,piece.top);lower=Math.max(lower,piece.bottom)}
    for(const piece of block.boundaryInk ?? []){top=Math.min(top,piece.top-axis);lower=Math.max(lower,piece.bottom-axis)}
    const core = block.core ? { top: block.core.top - axis, bottom: block.core.bottom - axis } : { top, bottom: lower }
    const value={ block, axis, ink, top, lower, core, sortState:{sorted:false} }
    if(policy.immutableBlocks)normalizedBlocks.set(block,value)
    return {...value,index}
  })
  type Placed = typeof normalized[number] & { baseline: number }
  // Cache actual ink overlap constraints while trying different core values.
  // Each pair is measured once; fitting then evaluates scalar maxima only.
  const collisions = new Map<number, Map<number, number>>()
  const collisionDistance = (prior: Placed, item: typeof normalized[number]) => {
    if (policy.wholeRows) return prior.lower - item.top
    let row = collisions.get(prior.index)
    if (!row) { row = new Map(); collisions.set(prior.index, row) }
    const cached = row.get(item.index)
    if (cached !== undefined) return cached
    if(!prior.sortState.sorted){prior.ink.sort((a,b)=>a.left-b.left);prior.sortState.sorted=true}
    if(!item.sortState.sorted){item.ink.sort((a,b)=>a.left-b.left);item.sortState.sorted=true}
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
        // stretch ceiling. Inline sections instead use their fixed core clearance.
        const musicGap = item.block.coreGapBefore ?? interpolateScoreCoreGap(gap, maxGap, coreGap, previous.block.coreGapScale)
        const separation = item.block.core && previous.block.core ? musicGap : headerGap
        baseline = Math.max(baseline, previous.baseline + previous.core.bottom - item.core.top + separation)
        for (const prior of policy.wholeRows ? [previous] : placed) {
          const localGap = item.block.coreGapBefore ?? interpolateScoreCoreGap(gap, maxGap, coreGap, prior.block.coreGapScale)
          // A collision cannot exceed the two complete ink envelopes. Distant
          // rows already clear this upper bound; avoid sweeping their pieces.
          if(prior.baseline+prior.lower-item.top+localGap*(policy.nonCoreGapRatio ?? nativeStyle.collisionGapRatio)<=baseline)continue
          baseline = Math.max(baseline, prior.baseline + collisionDistance(prior, item) + localGap * (policy.nonCoreGapRatio ?? nativeStyle.collisionGapRatio))
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
