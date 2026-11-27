import { SCORE_TEXT_FONT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import { nativeBarInk, nativeMeasureBarPositions } from './native-bars.js'
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

/** Always measure row-end numbers for page bounds; visibility only controls painting. */
export function placeNativeBarLabels(system: NativeSystem, regions: NativeRegion[], measurer: TextMeasurer, measureNumbers: boolean, width: number) {
  const lane = system.lanes.find(lane => lane.id === 'melody')
  if (!lane) return
  const painter = new NativeSymbols(measurer)
  for (const [index, measure] of system.measures.entries()) {
    if (!measure.lastFragment || (measure.source.repeatCount ?? 2) <= 2 && index !== system.measures.length - 1) continue
    const next = system.measures[index + 1]
    const bar = nativeMeasureBarPositions(system.measures, index).filter(bar => bar.kind !== 'rptstart').at(-1)
      ?? (next?.part === measure.part ? nativeMeasureBarPositions(system.measures, index + 1).find(bar => bar.kind === 'rptstart') : undefined)
    if (!bar) continue
    const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
    const barInk = nativeBarInk(bar.kind, bar.x, 0, measurer)
    let top = barInk.top
    const place = (text: string, size: number, meta: Record<string, string>) => {
      const rightAligned = meta['data-m3n-role'] === 'measure-number'
      const anchor = rightAligned ? 'end' : 'middle'
      const draw = () => {
        let raw = painter.text(text, bar.x, 0, size, SCORE_TEXT_FONT, { 'text-anchor': anchor, ...meta })
        let ink = nativeSvgInk(raw, measurer)
        // A small page margin must not clip multi-digit labels or font overhang.
        // Measure numbers end at the bar's outer painted edge.
        // Repeat counts retain centred alignment unless they leave the canvas.
        const dx = Math.max(-ink.left, Math.min(rightAligned ? barInk.right - ink.right : 0, width - ink.right))
        if (dx) {
          raw = painter.text(text, bar.x + dx, 0, size, SCORE_TEXT_FONT, { 'text-anchor': anchor, ...meta })
          ink = nativeSvgInk(raw, measurer)
        }
        const y = (rightAligned ? barInk.top - nativeStyle.measureNumberBarGap : top - nativeStyle.music * 0.12) - ink.bottom
        if (rightAligned) {
          raw = `<rect x="${n(ink.left - nativeStyle.measureNumberPadding)}" y="${n(ink.top - nativeStyle.measureNumberPadding)}" width="${n(ink.right - ink.left + nativeStyle.measureNumberPadding)}" height="${n(ink.bottom - ink.top + 2 * nativeStyle.measureNumberPadding)}" fill="#fff"/>${raw}`
        } else {
          top = y + ink.top
          lane.top = Math.max(lane.top, -top)
          regions.push({ lane: lane.id, left: ink.left, right: ink.right, top: -top })
        }
        return `<g transform="translate(0 ${n(y)})">${raw}</g>`
      }
      system.decorationLayout ??= []
      if (rightAligned && system.numericGeometry && !measureNumbers) {
        let svg: string | undefined
        system.decorationLayout.push({ lane: lane.id, measureNumber: true, hidden: true,
          get svg() { return svg ??= draw() } })
      } else system.decorationLayout.push({ lane: lane.id, svg: draw(), measureNumber: rightAligned,
        ...(rightAligned && !measureNumbers ? { hidden: true } : {}) })
    }
    if ((measure.source.repeatCount ?? 2) > 2) place(`×${measure.source.repeatCount}`, nativeStyle.repeatCount, { 'data-m3n-role': 'repeat-count' })
    const first = glyphs[0]
    if (!measure.source.interlude && first && index === system.measures.length - 1) place(String(measure.number ?? measure.index + 1), nativeStyle.measureNumber, { 'data-m3n-role': 'measure-number', 'data-m3n-id': first.xmlId })
  }
}

/** Hidden numeric labels do not participate in painted-ink obstacles. */
export function isNativeMeasureNumber(item: { measureNumber?: boolean; svg: string }): boolean {
  return item.measureNumber ?? item.svg.includes('data-m3n-role="measure-number"')
}
export function copyNativeDecoration<T extends { measureNumber?: boolean; svg: string }>(item: T): T {
  return item.measureNumber ? Object.create(Object.getPrototypeOf(item), Object.getOwnPropertyDescriptors(item)) : { ...item }
}
