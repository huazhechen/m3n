export type NativePageBlock = { height: number; gapBefore?: number }
export type NativeBlockPosition = { page: number; top: number }

/** Place measured blocks with natural gaps on every page.
 * Page capacity determines breaks, never the distance between systems.
 */
export function paginateNativeBlocks(blocks: readonly NativePageBlock[], options: {
  pageHeight: number; margin: number; gap: number
}): { positions: NativeBlockPosition[]; heights: number[] } {
  const { pageHeight, margin, gap } = options
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
