import { prepareScorePagination, scoreLayoutConfig } from '@m3n/numbered-notation'
import { staffHeaderBlock, staffRowBlock } from './staff-row-pagination.js'
import { SvgGeometry, nodes, hasClass, overlapsX, type Ink, type MeasureText } from './layout-svg.js'
import type { StaffSystem } from './system-layout.js'

/** Diagnostic only: same breaks, width and actual row geometry in both modes. */
export function compareStaffAvoidance(systems: StaffSystem[], height: number, headerHeight: number, gap: number,
  measure: MeasureText, gutter: number) {
  const started = performance.now(), scale = scoreLayoutConfig.staff.engine.scale
  const measureInk = systems.map(system => {
    const geometry = new SvgGeometry(system.node, measure, true)
    const logical = (ink: Ink): Ink => ({ left: ink.left * scale + gutter, right: ink.right * scale + gutter,
      top: ink.top * scale, bottom: ink.bottom * scale })
    const measures = nodes(system.node).filter(node => hasClass(node, 'measure')).map(node => logical(geometry.ink(node)))
    const attachments = nodes(system.node).filter(node => !hasClass(node, 'measure')).flatMap(node => geometry.pieces(node).map(logical))
    for (const piece of attachments) {
      const overlapping = measures.filter(box => overlapsX(box, piece))
      if (!overlapping.length) { measures.push(piece); continue }
      for (const box of overlapping) {
        box.top = Math.min(box.top, piece.top); box.bottom = Math.max(box.bottom, piece.bottom)
      }
    }
    return measures
  })
  const extractMs = performance.now() - started
  const common = systems.map((system, index) => staffRowBlock(system, index, gap))
  const options = { pageHeight: height, margin: scoreLayoutConfig.staff.pageInset, gap, maxGap: gap, headerGap: 0 }
  const run = (wholeRows: boolean) => {
    const begun = performance.now()
    const blocks = [staffHeaderBlock(headerHeight), ...common.map((block, index) => ({ ...block,
      ...(wholeRows ? {} : { ink: measureInk[index] }) }))]
    const paginate = prepareScorePagination(blocks, { wholeRows, nonCoreGapRatio: .3 })
    const result = paginate(options), coldMs = performance.now() - begun
    const warm = performance.now()
    for (let i = 0; i < 10; i++) paginate(options)
    return { pages: result.heights.length, coldMs, warmMeanMs: (performance.now() - warm) / 10 }
  }
  return { rows: systems.length, rectangles: measureInk.reduce((sum, pieces) => sum + pieces.length, 0),
    extractMs, wholeRows: run(true), measures: run(false) }
}
