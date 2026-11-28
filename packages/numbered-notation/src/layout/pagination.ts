import { scorePageGeometry } from './page-geometry.js'
import { balanceScorePageTail } from './page-tail.js'
import { interpolateScoreCoreGap, scoreVerticalSpacing, scoreHeaderGap, scoreVerticalCost, type ScoreVerticalSpacing } from './policy.js'
import { scoreLayoutConfig } from '../score-layout-config.js'
import { scorePageCollision, scorePageDistance, type ScoreCollision } from './page-collision.js'
import type { ScoreInk, ScorePageBlock, ScoreBlockPosition } from './geometry.js'
export type { ScorePageBlock, ScoreBlockPosition } from './geometry.js'
type ElasticOptions = { pageHeight: number; margin: number; gap: number; maxGap?: number; headerGap?: number; headerGapRatio?: number; vertical?: ScoreVerticalSpacing; pageCeiling?: number }
type NormalizedBlock={block:ScorePageBlock;axis:number;ink:ScoreInk[];top:number;lower:number;core:{top:number;bottom:number};boundaryInk:ScoreInk[];edgeInk:(ScoreInk & {gap:number})[];edgeGap:number;sortState:{sorted:boolean}}
const normalizedBlocks=new WeakMap<ScorePageBlock,NormalizedBlock>()
const immutableCollisions=new WeakMap<ScorePageBlock,WeakMap<ScorePageBlock,ScoreCollision>>()
/** Place measured blocks; elastic pages fit one core parameter after breaking. */
export function paginateScoreBlocks(blocks: readonly ScorePageBlock[], options: {
  pageHeight: number; margin: number; gap: number; elastic?: boolean; maxGap?: number; headerGap?: number; headerGapRatio?: number; vertical?: ScoreVerticalSpacing
}): { positions: ScoreBlockPosition[]; heights: number[]; coreGaps?: number[]; verticalCost?: number } {
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
export function fitScoreCoreGap(heightAt: (gap: number) => number, capacity: number, minimum = scoreVerticalSpacing().minimum, maximum = minimum * 2): number {
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
  const normalize = (block: ScorePageBlock, index: number, dynamic = false) => {
    const saved=policy.immutableBlocks && normalizedBlocks.get(block)
    if(saved)return {block:saved.block,axis:saved.axis,ink:saved.ink,top:saved.top,lower:saved.lower,core:saved.core,boundaryInk:saved.boundaryInk,edgeInk:saved.edgeInk,edgeGap:saved.edgeGap,sortState:saved.sortState,index,dynamic}
    const axis = block.baseline ?? 0
    const geometry = scorePageGeometry(block, Boolean(policy.immutableBlocks))
    const { ink, boundaryInk, edgeInk, edgeGap, top, bottom: lower } = geometry
    const core = { top: geometry.coreTop, bottom: geometry.coreBottom }
    const value={ block, axis, ink, top, lower, core, boundaryInk, edgeInk, edgeGap, sortState:geometry }
    if(policy.immutableBlocks)normalizedBlocks.set(block,value)
    return {block,axis,ink,top,lower,core,boundaryInk,edgeInk,edgeGap,sortState:value.sortState,index,dynamic}
  }
  const normalized = blocks.map((block,index)=>normalize(block,index))
  const atGap = (gap: number) => normalized.map((item,index)=>blocks[index]!.atRowGap ? normalize(blocks[index]!.atRowGap!(gap),index,true) : item)
  type Placed = typeof normalized[number] & { baseline: number }
  const atBaseline=(item:typeof normalized[number],baseline:number):Placed=>({block:item.block,axis:item.axis,ink:item.ink,top:item.top,
    lower:item.lower,core:item.core,boundaryInk:item.boundaryInk,edgeInk:item.edgeInk,edgeGap:item.edgeGap,sortState:item.sortState,index:item.index,dynamic:item.dynamic,baseline})
  // Cache actual ink overlap constraints while trying different core values.
  // Each pair is measured once; fitting then evaluates scalar maxima only.
  const collisions = new Map<number, Map<number, ScoreCollision>>()
  const collisionDistance = (prior: Placed, item: typeof normalized[number]) => {
    if (prior.dynamic || item.dynamic) {
      if (!prior.sortState.sorted) { prior.ink.sort((a,b)=>a.left-b.left);prior.sortState.sorted=true }
      if (!item.sortState.sorted) { item.ink.sort((a,b)=>a.left-b.left);item.sortState.sorted=true }
      return scorePageCollision(prior,item)
    }
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
  return ({ pageHeight, margin, gap, maxGap = gap, headerGap = scoreHeaderGap(gap), headerGapRatio, vertical, pageCeiling }: ElasticOptions): {positions: ScoreBlockPosition[]; heights: number[]; coreGaps: number[]; verticalCost?: number} => {
    for (const item of normalized)
      if (item.lower - item.top > pageHeight - margin * 2 + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    const nextBaseline = (item: typeof normalized[number], placed: Placed[], coreGap: number) => {
      let baseline = margin - item.top
      const previous = placed.at(-1)
      if (previous) {
        // Header adapters and their external clearance follow this same N.
        // Lyrics reduce the starting clearance, while retaining the same page
        // stretch ceiling. Inline sections instead use their fixed core clearance.
        const musicGap = vertical ? coreGap : item.block.coreGapBefore ?? interpolateScoreCoreGap(gap, maxGap, coreGap, previous.block.coreGapScale)
        const currentHeaderGap = headerGapRatio === undefined ? headerGap : coreGap * headerGapRatio
        const separation = item.block.core && previous.block.core ? musicGap : currentHeaderGap
        baseline = Math.max(baseline, previous.baseline + previous.core.bottom - item.core.top + separation)
        for (const prior of placed) {
          const localGap = vertical ? (prior.block.core && item.block.core ? coreGap : (headerGapRatio === undefined ? headerGap / .8 : coreGap)) : item.block.coreGapBefore ?? interpolateScoreCoreGap(gap, maxGap, coreGap, prior.block.coreGapScale)
          // A collision cannot exceed the two complete ink envelopes. Distant
          // rows already clear this upper bound; avoid sweeping their pieces.
          const clearance=Math.max(localGap*scoreLayoutConfig.page.collisionGapRatio,prior.edgeGap,item.edgeGap)
          if(prior.baseline+(prior.lower-item.top+clearance)<=baseline)continue
          const pair = collisionDistance(prior, item)
          baseline = Math.max(baseline, prior.baseline + scorePageDistance(pair, localGap, -Infinity))
        }
        baseline += item.block.gapBefore ?? 0
      }
      return baseline
    }
    if (vertical && Number.isFinite(pageHeight)) {
      // One immutable break plan, one shared N. Natural pagination is
      // monotone in N; refit page membership on every feasibility probe.
      const arrange = (n: number) => {
        const positions: ScoreBlockPosition[] = [], heights: number[] = []
        let page = 0, current: Placed[] = []
        for (const item of atGap(n)) {
          let baseline = nextBaseline(item, current, n)
          if (current.length && baseline + item.lower > pageHeight - margin + 1e-6) {
            page++; current = []; baseline = nextBaseline(item, current, n)
          }
          if (baseline + item.lower > pageHeight - margin + 1e-6) return undefined
          positions.push({page, top: baseline - item.axis})
          current.push(atBaseline(item, baseline)); heights[page] = pageHeight
        }
        return {positions, heights}
      }
      const minimum = arrange(vertical.minimum)
      if (!minimum) throw new Error('单个谱行无法放入A4页面。')
      const pages = minimum.heights.length
      if (pageCeiling !== undefined && pages > pageCeiling)
        throw Object.assign(new Error('谱行超过当前候选页数上限。'), {code:'M3N_PAGE_BOUND_REJECTED',pageCount:pages})
      let low = vertical.minimum, high = vertical.maximum
      if ((arrange(high)?.heights.length ?? Infinity) <= pages) low = high
      else for (let iteration = 0; iteration < 24; iteration++) {
        const middle = (low + high) / 2
        if ((arrange(middle)?.heights.length ?? Infinity) <= pages) low = middle
        else high = middle
      }
      const fitted = low === vertical.minimum ? minimum : arrange(low)!
      const musicPerPage = Array<number>(pages).fill(0)
      normalized.forEach((item, index) => { if (item.block.core) musicPerPage[fitted.positions[index]!.page]!++ })
      return {...fitted, coreGaps: Array<number>(pages).fill(low),
        verticalCost: musicPerPage.some(count => count > 1) ? scoreVerticalCost(low, vertical) : 0}
    }
    // Determine membership once using the minimum; fitting never moves a block
    // to another page or changes a line's horizontal layout.
    const groups: { first: number; end: number }[] = []
    let first = 0, placed: Placed[] = []
    const continuousBlocks = atGap(gap)
    continuousBlocks.forEach((item, index) => {
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
        const item = continuousBlocks[index]!, baseline = nextBaseline(item, current, gap)
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
        const currentBlocks = coreGap === gap ? continuousBlocks : atGap(coreGap)
        let bottom = margin
        for (let index = group.first; index < group.end; index++) {
          const item = currentBlocks[index]!, baseline = nextBaseline(item, current, coreGap)
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

/** Every member of a shared page uses one N; remaining height stays at the tail. */
export function fitSharedScorePage(heights: readonly ((gap: number) => number)[], capacity: number, spacing: ScoreVerticalSpacing) {
  const scoreGapAt = (gap: number) => gap * scoreLayoutConfig.scorebook.sharedScoreGapRowRatio
  const heightAt = (gap: number) => heights.reduce((sum,height)=>sum+height(gap),scoreGapAt(gap)*(heights.length-1))
  const coreGap = fitScoreCoreGap(heightAt,capacity,spacing.minimum,spacing.maximum)
  const contentHeight = heightAt(coreGap)
  return {coreGap,scoreGap:scoreGapAt(coreGap),trailingGap:Math.max(0,capacity-contentHeight),usedHeight:capacity}
}
