export type NativePageBlock = { height: number; gapBefore?: number }
export type NativeBlockPosition = { page: number; top: number }

/** Place measured blocks, sharing surplus space on complete pages only.
 * The header is a block too, so its gap participates on the first page.
 */
export function paginateNativeBlocks(blocks: readonly NativePageBlock[], options: {
  pageHeight: number; margin: number; gap: number; justify: boolean
}): { positions: NativeBlockPosition[]; heights: number[] } {
  const { pageHeight, margin, gap, justify } = options
  const capacity = pageHeight - margin * 2
  const groups: { first: number; end: number; occupied: number }[] = []
  let first = 0, occupied = 0
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    if (!Number.isFinite(block.height) || block.height < 0) throw new Error('谱面块高度必须为非负有限数值。')
    if (block.height > capacity + 1e-6) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    const separation = index === first ? 0 : gap + (block.gapBefore ?? 0)
    if (occupied + separation + block.height > capacity + 1e-6 && index > first) {
      groups.push({ first, end: index, occupied }); first = index; occupied = block.height
    } else occupied += separation + block.height
  }
  if (first < blocks.length) groups.push({ first, end: blocks.length, occupied })
  const positions: NativeBlockPosition[] = [], heights: number[] = []
  groups.forEach((group, page) => {
    const surplus = justify && page < groups.length - 1 ? Math.max(0, capacity - group.occupied) / (group.end - group.first) : 0
    let top = margin
    for (let index = group.first; index < group.end; index++) {
      if (index > group.first) top += gap + (blocks[index]!.gapBefore ?? 0) + surplus
      positions[index] = { page, top }; top += blocks[index]!.height
    }
    heights[page] = pageHeight === Infinity ? top + margin : pageHeight
  })
  return { positions, heights }
}
