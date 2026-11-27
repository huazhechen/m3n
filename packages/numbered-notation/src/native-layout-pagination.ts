import { A4_CONTENT_ASPECT_RATIO } from '@m3n/notation'
import { scoreMaximumCoreGap } from './layout/policy.js'
import { paginateScoreBlocks } from './layout/pagination.js'
import { nativeCoreGap, nativeHeaderGap } from './native-style.js'
import type { NativeLayout, NativePage } from './native-layout-model.js'

export function positionNativeLayout(layout: NativeLayout, pagination: ReturnType<typeof paginateScoreBlocks>) {
  const { options, systems, headerBlocks, verticalBlocks } = layout
  const pages: NativePage[] = pagination.heights.map((height, index) => ({ index, width: options.width, height, systems: [], coreGap: pagination.coreGaps?.[index] }))
  for (const [index, block] of headerBlocks.entries()) {
    const position = pagination.positions[index]!
    pages[position.page]!.header = (pages[position.page]!.header ?? '') + `<g transform="translate(0 ${position.top})">${block.svg}</g>`
  }
  for (const [index, system] of systems.entries()) {
    const position = pagination.positions[index + headerBlocks.length]!
    const dy = position.top - system.top
    system.top = position.top; system.page = position.page
    for (const lane of system.lanes) {
      lane.y += dy
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) if (glyph.lane === lane.id) glyph.y = lane.y
    }
    system.bottom = position.top + verticalBlocks[index + headerBlocks.length]!.height
    pages[position.page]!.systems.push(system)
  }
  layout.pages = pages
}

export function nativeContinuousPagination(layout: NativeLayout, coreGap: number) {
  return layout.pagination({ pageHeight: Infinity, margin: layout.margin, gap: coreGap, headerGap: nativeHeaderGap(layout.document) })
}

/** Change page membership and vertical spacing without repeating horizontal layout. */
export function repaginateNativeLayout(layout: NativeLayout, paged: boolean, coreGap?: number) {
  const gap = coreGap ?? (nativeCoreGap(layout.document))
  const pagination = layout.pagination({
    pageHeight: paged ? Math.floor(layout.options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin: layout.margin, gap, headerGap: nativeHeaderGap(layout.document), maxGap: coreGap ?? (paged ? Math.max(scoreMaximumCoreGap(nativeCoreGap(layout.document)), gap) : gap),
  })
  layout.options = { ...layout.options, paged, coreGap }
  positionNativeLayout(layout, pagination)
}

export function reflowNativeContinuousLayout(layout: NativeLayout, coreGap: number) {
  if (layout.options.paged) throw new Error('Only continuous layouts can be reflowed as a shared page')
  positionNativeLayout(layout, nativeContinuousPagination(layout, coreGap))
  layout.options = { ...layout.options, coreGap }
}
