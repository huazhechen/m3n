import { nativeStyle } from './native-style.js'
import { nativeBarSvg, nativeMeasureBarPositions } from './native-bars.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeRegion } from './native-annotations.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols, n } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'

export function placeNativeNavigation(system: NativeSystem) {
  const lane = system.lanes.find(l => l.id === 'melody')
  if (!lane) return
  for (const measure of system.measures) if (measure.lastFragment) for (const mark of measure.navigation ?? []) {
    const svg = `<g transform="translate(${n(mark.x!)} 0)">${mark.svg}</g>`
    const ink = mark.ink
    lane.top = Math.max(lane.top, -ink.top); lane.bodyBottom = Math.max(lane.bodyBottom ?? 0, ink.bottom)
    lane.lyricBottom = Math.max(lane.lyricBottom ?? 0, ink.bottom)
    system.decorationLayout ??= []; system.decorationLayout.push({ lane: lane.id, svg })
  }
}

/** Bar-owned labels are measured before endings, which must clear the whole
 * bar attachment. The measure number stacks above an optional repeat count. */
export function placeNativeBarLabels(system: NativeSystem, regions: NativeRegion[], measurer: TextMeasurer, measureNumbers: boolean) {
  const lane = system.lanes.find(lane => lane.id === 'melody')
  if (!lane) return
  const painter = new NativeSymbols(measurer)
  for (const [index, measure] of system.measures.entries()) {
    if (!measure.lastFragment) continue
    const next = system.measures[index + 1]
    const bar = nativeMeasureBarPositions(system.measures, index).filter(bar => bar.kind !== 'rptstart').at(-1)
      ?? (next?.part === measure.part ? nativeMeasureBarPositions(system.measures, index + 1).find(bar => bar.kind === 'rptstart') : undefined)
    if (!bar) continue
    let top = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer).top
    const place = (text: string, size: number, meta: Record<string, string>) => {
      const raw = painter.text(text, bar.x, 0, size, 'serif', { 'text-anchor': 'middle', ...meta })
      const ink = nativeSvgInk(raw, measurer), y = top - nativeStyle.music * 0.12 - ink.bottom
      top = y + ink.top
      lane.top = Math.max(lane.top, -top)
      regions.push({ lane: lane.id, left: ink.left, right: ink.right, top: -top })
      system.decorationLayout ??= []
      system.decorationLayout.push({ lane: lane.id, svg: `<g transform="translate(0 ${n(y)})">${raw}</g>` })
    }
    if ((measure.source.repeatCount ?? 2) > 2) place(`×${measure.source.repeatCount}`, nativeStyle.repeatCount, { 'data-m3n-role': 'repeat-count' })
    const first = measure.columns.flatMap(column => column.glyphs).find(glyph => glyph.lane === lane.id)
    if (measureNumbers && first) place(String(measure.number ?? measure.index + 1), nativeStyle.measureNumber, { 'data-m3n-role': 'annotation', 'data-m3n-id': first.xmlId })
  }
}
