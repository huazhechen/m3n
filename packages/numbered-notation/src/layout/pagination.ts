import { scorePageGeometry } from './page-geometry.js'
import { balanceScorePageTail } from './page-tail.js'
import { interpolateScoreCoreGap, scoreCoreGap } from './policy.js'
import { scoreLayoutConfig } from '../score-layout-config.js'
import { scorePageCollision, scorePageDistance, type ScoreCollision } from './page-collision.js'
import type { ScoreInk, ScorePageBlock, ScoreBlockPosition } from './geometry.js'
export type { ScorePageBlock, ScoreBlockPosition } from './geometry.js'
type ElasticOptions = { pageHeight: number; margin: number; gap: number; maxGap?: number; headerGap?: number }
type NormalizedBlock={block:ScorePageBlock;axis:number;ink:ScoreInk[];top:number;lower:number;core:{top:number;bottom:number};boundaryInk:ScoreInk[];edgeInk:(ScoreInk & {gap:number})[];sortState:{sorted:boolean}}
const normalizedBlocks=new WeakMap<ScorePageBlock,NormalizedBlock>()
const immutableCollisions=new WeakMap<ScorePageBlock,WeakMap<ScorePageBlock,ScoreCollision>>()

/** Place measured blocks; elastic pages fit one core parameter after breaking. */
export function paginateScoreBlocks(blocks: readonly ScorePageBlock[], options: {
  pageHeight: number; margin: number; gap: number; elastic?: boolean; maxGap?: number; headerGap?: number
}): { positions: ScoreBlockPosition[]; heights: number[]; coreGaps?: number[] } {
  const { pageHeight, margin, gap } = options
  if (options.elastic) return prepareScorePagination(blocks)(options)
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
  const positions: ScoreBlockPosition[] = [], heights: number[] = []
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
export function fitScoreCoreGap(heightAt: (gap: number) => number, capacity: number, minimum = scoreCoreGap(), maximum = minimum * 1.1): number {
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
export function prepareScorePagination(blocks: readonly ScorePageBlock[], policy: { immutableBlocks?:boolean } = {}) {
  const normalized = blocks.map((block, index) => {
    const saved=policy.immutableBlocks && normalizedBlocks.get(block)
    if(saved)return {block:saved.block,axis:saved.axis,ink:saved.ink,top:saved.top,lower:saved.lower,core:saved.core,boundaryInk:saved.boundaryInk,edgeInk:saved.edgeInk,sortState:saved.sortState,index}
    const axis = block.baseline ?? 0
    const geometry = scorePageGeometry(block)
    const { ink, boundaryInk, edgeInk, top, bottom: lower } = geometry
    const core = { top: geometry.coreTop, bottom: geometry.coreBottom }
    const value={ block, axis, ink, top, lower, core, boundaryInk, edgeInk, sortState:{sorted:false} }
    if(policy.immutableBlocks)normalizedBlocks.set(block,value)
    return {block,axis,ink,top,lower,core,boundaryInk,edgeInk,sortState:value.sortState,index}
  })
  type Placed = typeof normalized[number] & { baseline: number }
  const atBaseline=(item:typeof normalized[number],baseline:number):Placed=>({block:item.block,axis:item.axis,ink:item.ink,top:item.top,
    lower:item.lower,core:item.core,boundaryInk:item.boundaryInk,edgeInk:item.edgeInk,sortState:item.sortState,index:item.index,baseline})
  // Cache actual ink overlap constraints while trying different core values.
  // Each pair is measured once; fitting then evaluates scalar maxima only.
  const collisions = new Map<number, Map<number, ScoreCollision>>()
  const collisionDistance = (prior: Placed, item: typeof normalized[number]) => {
    const shared = policy.immutableBlocks ? immutableCollisions.get(prior.block) : undefined
    const known = shared?.get(item.block)
    if (known !== undefined) return known
    let row = collisions.get(prior.index)
    if (!row) { row = new Map(); collisions.set(prior.index, row) }
    const cached = row.get(item.index)
    if (cached !== undefined) return cached
    if(!prior.sortState.sorted){prior.ink.sort((a,b)=>a.left-b.left);prior.sortState.sorted=true}
    if(!item.sortState.sorted){item.ink.sort((a,b)=>a.left-b.left);item.sortState.sorted=true}
    const distance = scorePageCollision(prior, item)
    row.set(item.index, distance)
    if (policy.immutableBlocks) {
      const pairs = shared ?? new WeakMap<ScorePageBlock, ScoreCollision>()
      pairs.set(item.block, distance)
      if (!shared) immutableCollisions.set(prior.block, pairs)
    }
    return distance
  }
  return ({ pageHeight, margin, gap, maxGap = gap, headerGap = scoreCoreGap() * .8 }: ElasticOptions) => {
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
        for (const prior of placed) {
          const localGap = item.block.coreGapBefore ?? interpolateScoreCoreGap(gap, maxGap, coreGap, prior.block.coreGapScale)
          // A collision cannot exceed the two complete ink envelopes. Distant
          // rows already clear this upper bound; avoid sweeping their pieces.
          if(!prior.edgeInk.length && !item.edgeInk.length && prior.baseline+prior.lower-item.top+localGap*scoreLayoutConfig.page.collisionGapRatio<=baseline)continue
          const pair = collisionDistance(prior, item)
          baseline = Math.max(baseline, prior.baseline + scorePageDistance(pair, localGap, -Infinity))
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
      placed.push(atBaseline(item,baseline))
    })
    if (placed.length) groups.push({ first, end: normalized.length })
    const balanced = balanceScorePageTail(groups, (first, end) => {
      const current: Placed[] = []
      for (let index = first; index < end; index++) {
        const item = normalized[index]!, baseline = nextBaseline(item, current, gap)
        if (baseline + item.lower > pageHeight - margin + 1e-6) return false
        current.push(atBaseline(item,baseline))
      }
      return true
    }, (first, end) => blocks.slice(first, end).filter(block => block.core).length,
    index => Boolean(blocks[index - 1]?.core))
    const positions: ScoreBlockPosition[] = [], heights: number[] = [], coreGaps: number[] = []
    for (const [page, group] of balanced.entries()) {
      const arrange = (coreGap: number, publish = false) => {
        const current: Placed[] = []
        let bottom = margin
        for (let index = group.first; index < group.end; index++) {
          const item = normalized[index]!, baseline = nextBaseline(item, current, coreGap)
          current.push(atBaseline(item,baseline)); bottom = Math.max(bottom, baseline + item.lower)
          if (publish) positions[index] = { page, top: baseline - item.axis }
        }
        return bottom + margin
      }
      const coreGap = Number.isFinite(pageHeight) && maxGap > gap ? fitScoreCoreGap(arrange, pageHeight, gap, maxGap) : gap
      const height = arrange(coreGap, true)
      coreGaps.push(coreGap); heights.push(Number.isFinite(pageHeight) ? pageHeight : height)
    }
    return { positions, heights, coreGaps }
  }
}
