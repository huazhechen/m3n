// Extrema adapted from svg-path-bbox 2.1.0, BSD-3-Clause.
// Copyright (c) 2020-2024, Álvaro Mondéjar Rubio. All rights reserved.
// Full notice: public/licenses/svg-path-bbox/LICENSE.txt.
import type { Ink } from './layout-svg.js'

// Match svg-path-bbox's quadratic/cubic extrema and its 1e-8 degeneracy
// threshold. Inputs are the rounded coordinates actually emitted by SVGContext.
type Range = { min: number; max: number }
function quadratic(a: number, b: number, c: number, range: Range): void {
  const min = Math.min(a, c), max = Math.max(a, c)
  if (b >= a ? c >= b : c <= b) { range.min = min; range.max = max; return }
  const extreme = (a * c - b * b) / (a - 2 * b + c)
  range.min = extreme < min ? extreme : min; range.max = extreme < min ? max : extreme
}
function cubic(a: number, b: number, c: number, d: number, range: Range, floor: number, ceiling: number): void {
  const k = a - 3 * b + 3 * c - d
  if (Math.abs(k) < 1e-8) {
    if (a === d && a === b) { range.min = a; range.max = d; return }
    quadratic(a, -0.5 * a + 1.5 * b, a - 3 * b + 3 * c, range); return
  }
  // On a nondegenerate cubic the evaluated extrema are convex combinations.
  // A strictly interior control hull cannot enlarge already accumulated ink.
  // Retain the legacy quadratic fallback above (its rounding is significant).
  const low = floor + 1e-6, high = ceiling - 1e-6
  if (floor >= -1e6 && ceiling <= 1e6 && a > low && a < high && b > low && b < high && c > low && c < high && d > low && d < high) {
    range.min = floor; range.max = ceiling; return
  }
  const discriminant = -a * c + a * d - b * c - b * d + b * b + c * c
  let min = Math.min(a, d), max = Math.max(a, d)
  if (discriminant <= 0) { range.min = min; range.max = max; return }
  const squareRoot = Math.sqrt(discriminant), l = a - 2 * b + c
  for (let i = 0; i < 2; i++) {
    const t = i === 0 ? (l + squareRoot) / k : (l - squareRoot) / k
    if (t > 0 && t < 1) {
      const value = a * (1 - t) * (1 - t) * (1 - t) + b * 3 * (1 - t) * (1 - t) * t +
        c * 3 * (1 - t) * t * t + d * t * t * t
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  range.min = min; range.max = max
}

/** Numeric subpaths stay local to a single context path; no SVG parsing. */
export class StaffPathInk {
  private readonly boxes: Ink[] = []
  private current?: Ink
  private x = 0
  private y = 0
  private startX = 0
  private startY = 0
  private snapshot?: readonly Ink[]
  private readonly range: Range = { min: 0, max: 0 }
  private include(left: number, right: number, top: number, bottom: number) {
    if (!this.current) throw new Error('五线谱路径缺少起点。')
    this.current.left = Math.min(this.current.left, left)
    this.current.right = Math.max(this.current.right, right)
    this.current.top = Math.min(this.current.top, top)
    this.current.bottom = Math.max(this.current.bottom, bottom)
    this.snapshot = undefined
  }
  move(x: number, y: number) {
    this.x = this.startX = x; this.y = this.startY = y
    this.current = { left: x, right: x, top: y, bottom: y }
    this.boxes.push(this.current)
    this.snapshot = undefined
  }
  line(x: number, y: number) {
    this.include(x, x, y, y)
    this.x = x; this.y = y
  }
  quadratic(cx: number, cy: number, x: number, y: number) {
    quadratic(this.x, cx, x, this.range)
    const left = this.range.min, right = this.range.max
    quadratic(this.y, cy, y, this.range)
    this.include(left, right, this.range.min, this.range.max)
    this.x = x; this.y = y
  }
  cubic(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number) {
    cubic(this.x, cx1, cx2, x, this.range, this.current!.left, this.current!.right)
    const left = this.range.min, right = this.range.max
    cubic(this.y, cy1, cy2, y, this.range, this.current!.top, this.current!.bottom)
    this.include(left, right, this.range.min, this.range.max)
    this.x = x; this.y = y
  }
  close() { this.x = this.startX; this.y = this.startY }
  ink(): readonly Ink[] { return this.snapshot ??= this.boxes.map(box => ({ ...box })) }
}

/** One independent coordinate axis of a rounded path. Fixed vertical origins
 * can share this result within a drawing template, without translating bounds. */
export class StaffPathAxis {
  readonly ranges: Range[] = []
  private current?: Range
  private position = 0
  private start = 0
  private readonly range: Range = { min: 0, max: 0 }
  move(value: number) {
    this.position = this.start = value
    this.current = { min: value, max: value }
    this.ranges.push(this.current)
  }
  line(value: number) { this.include(value, value); this.position = value }
  quadratic(control: number, value: number) {
    quadratic(this.position, control, value, this.range)
    this.include(this.range.min, this.range.max); this.position = value
  }
  cubic(first: number, second: number, value: number) {
    cubic(this.position, first, second, value, this.range, this.current!.min, this.current!.max)
    this.include(this.range.min, this.range.max); this.position = value
  }
  close() { this.position = this.start }
  get end() { return this.position }
  private include(min: number, max: number) {
    if (!this.current) throw new Error('五线谱路径缺少起点。')
    this.current.min = Math.min(this.current.min, min)
    this.current.max = Math.max(this.current.max, max)
  }
}
