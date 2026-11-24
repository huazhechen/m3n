import { bravuraGeometry } from './bravura.js'
import { unionNativeInk, translateNativeInk, type NativeInk } from './native-ink.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeMusicAxis } from './native-axis.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeEm as em } from './native-style.js'
import { attrs, circle } from './native-symbols.js'
import { nativeBarMetrics, nativeMeasureBars } from './native-horizontal.js'
import type { NativeMeasure } from './native-model.js'

/** One shared list of visible bar positions, including merged repeat boundaries. */
export function nativeMeasureBarPositions(measures: NativeMeasure[], index: number) {
  const measure = measures[index]!, marks = nativeMeasureBars(measures, index)
  const positions: { kind: string; x: number }[] = []
  if (marks.opening) positions.push({ kind: 'rptstart', x: measure.openingBarX ?? measure.start + em(2) })
  if (marks.closing !== undefined) positions.push({ kind: marks.closing, x: measure.barX ?? measure.end - em(3) })
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
  const geometry = nativeBarMetrics(kind), top = y + nativeMusicAxis(measurer) - geometry.size / 2
  const pieces = geometry.bars.map(bar => {
    const left = n(x - geometry.anchor + bar.x), upper = n(top)
    return {left, right:left+n(bar.width), top:upper, bottom:upper+n(geometry.size)}
  })
  if (geometry.dots.length) {
    const ink = bravuraGeometry('repeatDot',geometry.radius*2,true,measurer,geometry.radius*2).ink
    for (const dot of geometry.dots) for (const ratio of [0.38,0.62])
      pieces.push(translateNativeInk(ink,n(x-geometry.anchor+dot),n(top+geometry.size*ratio-geometry.radius)))
  }
  return pieces
}
export function nativeBarInk(kind: string, x: number, y: number, measurer: TextMeasurer) {
  return unionNativeInk(nativeBarPieces(kind,x,y,measurer))
}
