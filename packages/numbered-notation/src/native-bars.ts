import { nativeStyle, nativeEm as em } from './native-style.js'
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

/** The same bar primitives feed both local obstacle measurement and SVG output. */
export function nativeBarSvg(kind: string, x: number, y: number): string {
  const geometry = nativeBarMetrics(kind), top = y - nativeStyle.music * 0.3 - geometry.size / 2
  let svg = ''
  for (const bar of geometry.bars) svg += `<rect${attrs({ x: x - geometry.anchor + bar.x, y: top, width: bar.width, height: geometry.size, fill: '#000' })}/>`
  for (const dot of geometry.dots) for (const ratio of [0.38, 0.62]) svg += circle(x - geometry.anchor + dot, top + geometry.size * ratio, geometry.radius)
  return `<g${attrs({ 'data-m3n-role': 'bar', 'data-m3n-bar': kind })}>${svg}</g>`
}
