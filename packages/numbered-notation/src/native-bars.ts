import { nativeStyle } from './native-style.js'
import { bravuraGeometry } from './bravura.js'
import { unionNativeInk, translateNativeInk, type NativeInk } from './native-ink.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeMusicAxis } from './native-axis.js'
import type { TextMeasurer } from './native-measure.js'
import { attrs, circle } from './native-symbols.js'
import { nativeBarMetrics, nativeMeasureBars } from './native-horizontal.js'
import type { NativeMeasure } from './native-model.js'

/** One shared list of visible bar positions, including merged repeat boundaries. */
export function nativeMeasureBarPositions(measures: NativeMeasure[], index: number) {
  const measure = measures[index]!, marks = nativeMeasureBars(measures, index)
  const positions: { kind: string; x: number }[] = []
  if (marks.opening) positions.push({ kind: 'rptstart', x: measure.openingBarX ?? measure.start + nativeStyle.openingBarFallbackInset })
  if (marks.closing !== undefined) positions.push({ kind: marks.closing, x: measure.barX ?? measure.end - nativeStyle.closingBarFallbackInset })
  return positions
}

/** A lane paints boundaries only in fragments containing its own music. */
export function nativeLaneBarPositions(measures: NativeMeasure[], index: number, lane: string) {
  if (!measures[index]!.columns.some(column => column.glyphs.some(glyph => glyph.lane === lane))) return []
  return nativeMeasureBarPositions(measures, index)
}

/** The same bar primitives feed both local obstacle measurement and SVG output. */
export function nativeBarSvg(kind: string, x: number, y: number, measurer: TextMeasurer): string {
  const geometry = nativeBarMetrics(kind), top = y + nativeMusicAxis(measurer) - geometry.size / 2
  let svg = ''
  for (const bar of geometry.bars) svg += `<rect${attrs({ x: x - geometry.anchor + bar.x, y: top, width: bar.width, height: geometry.size, fill: '#000' })}/>`
  for (const dot of geometry.dots) for (const ratio of [0.38, 0.62]) svg += circle(x - geometry.anchor + dot, top + geometry.size * ratio, geometry.radius, measurer, true)
  return `<g${attrs({ 'data-m3n-role': 'bar', 'data-m3n-bar': kind })}>${svg}</g>`
}

/** Painted bar geometry with the same coordinate rounding as nativeBarSvg. */
export function nativeBarPieces(kind: string, x: number, y: number, measurer: TextMeasurer): NativeInk[] {
  const geometry = nativeBarMetrics(kind)
  const create = () => {
    const top = y + nativeMusicAxis(measurer) - geometry.size / 2, upper = n(top)
    return { top, upper, bottom: upper + n(geometry.size), widths: geometry.bars.map(bar => n(bar.width)) }
  }
  // Numeric row geometry uses a zero baseline. Cache only font-dependent
  // vertical values and widths; x must be rounded after actual placement.
  const frame = y === 0 ? measurer.fixedSymbol?.(`bar-frame:${kind}`, create) ?? create() : create()
  const pieces = geometry.bars.map((bar, index) => {
    const left = n(x - geometry.anchor + bar.x)
    return {left, right:left+frame.widths[index]!, top:frame.upper, bottom:frame.bottom}
  })
  if (geometry.dots.length) {
    const ink = bravuraGeometry('repeatDot',geometry.radius*2,true,measurer,geometry.radius*2).ink
    for (const dot of geometry.dots) for (const ratio of [0.38,0.62])
      pieces.push(translateNativeInk(ink,n(x-geometry.anchor+dot),n(frame.top+geometry.size*ratio-geometry.radius)))
  }
  return pieces
}
export function nativeBarInk(kind: string, x: number, y: number, measurer: TextMeasurer) {
  return unionNativeInk(nativeBarPieces(kind,x,y,measurer))
}
