import type { NativeInk } from './native-ink.js'
export type NativePageBlock = { height: number; gapBefore?: number; baseline?: number; core?: { top: number; bottom: number }; ink?: readonly NativeInk[] }
export type NativeBlockPosition = { page: number; top: number }

/** Place measured blocks with natural gaps on every page.
 * Page capacity determines breaks, never the distance between systems.
 */
export function paginateNativeBlocks(blocks: readonly NativePageBlock[], options: {
  pageHeight: number; margin: number; gap: number; elastic?: boolean
}): { positions: NativeBlockPosition[]; heights: number[] } {
  const { pageHeight, margin, gap } = options
  if (options.elastic) return paginateElasticBlocks(blocks, options)
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

function paginateElasticBlocks(blocks: readonly NativePageBlock[], { pageHeight, margin, gap }: { pageHeight: number; margin: number; gap: number }) {
  const positions: NativeBlockPosition[] = [], heights: number[] = []
  const placed: { baseline: number; core: { top: number; bottom: number }; ink: readonly NativeInk[] }[] = []
  let page = 0, bottom = margin
  const close = () => { heights.push(Number.isFinite(pageHeight) ? pageHeight : bottom + margin); page++; placed.length = 0; bottom = margin }
  for (const [index, block] of blocks.entries()) {
    const axis = block.baseline ?? 0
    const ink = (block.ink ?? []).map(piece => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis }))
    const top = Math.min(0, ...ink.map(piece => piece.top)), lower = Math.max(0, ...ink.map(piece => piece.bottom))
    if (lower - top > pageHeight - margin * 2 + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    const core = block.core ? { top: block.core.top - axis, bottom: block.core.bottom - axis } : { top, bottom: lower }
    let baseline = margin - top
    if (placed.length) {
      baseline = Math.max(baseline, placed.at(-1)!.baseline + placed.at(-1)!.core.bottom - core.top + gap)
      for (const previous of placed) for (const upper of previous.ink) for (const next of ink) {
        if (Math.min(upper.right, next.right) > Math.max(upper.left, next.left))
          baseline = Math.max(baseline, previous.baseline + upper.bottom + gap / 2 - next.top)
      }
      baseline += block.gapBefore ?? 0
    }
    if (placed.length && baseline + lower > pageHeight - margin + 1e-6) { close(); baseline = margin - top }
    positions[index] = { page, top: baseline - axis }
    placed.push({ baseline, ink, core }); bottom = Math.max(bottom, baseline + lower)
  }
  if (placed.length) close()
  return { positions, heights }
}
