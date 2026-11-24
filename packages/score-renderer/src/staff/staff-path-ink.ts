// Extrema adapted from svg-path-bbox 2.1.0, BSD-3-Clause.
// Copyright (c) 2020-2024, Álvaro Mondéjar Rubio. All rights reserved.
// Full notice: public/licenses/svg-path-bbox/LICENSE.txt.
import type { Ink } from './layout-svg.js'

// Match svg-path-bbox's quadratic/cubic extrema and its 1e-8 degeneracy
// threshold. Inputs are the rounded coordinates actually emitted by SVGContext.
function quadratic(a: number, b: number, c: number): [number, number] {
  const min = Math.min(a, c), max = Math.max(a, c)
  if (b >= a ? c >= b : c <= b) return [min, max]
  const extreme = (a * c - b * b) / (a - 2 * b + c)
  return extreme < min ? [extreme, max] : [min, extreme]
}
function cubic(a: number, b: number, c: number, d: number): [number, number] {
  const k = a - 3 * b + 3 * c - d
  if (Math.abs(k) < 1e-8) {
    if (a === d && a === b) return [a, d]
    return quadratic(a, -0.5 * a + 1.5 * b, a - 3 * b + 3 * c)
  }
  const discriminant = -a * c + a * d - b * c - b * d + b * b + c * c
  let min = Math.min(a, d), max = Math.max(a, d)
  if (discriminant <= 0) return [min, max]
  const squareRoot = Math.sqrt(discriminant), l = a - 2 * b + c
  for (const t of [(l + squareRoot) / k, (l - squareRoot) / k]) {
    if (t > 0 && t < 1) {
      const value = a * (1 - t) * (1 - t) * (1 - t) + b * 3 * (1 - t) * (1 - t) * t +
        c * 3 * (1 - t) * t * t + d * t * t * t
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  return [min, max]
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
    const [left, right] = quadratic(this.x, cx, x), [top, bottom] = quadratic(this.y, cy, y)
    this.include(left, right, top, bottom)
    this.x = x; this.y = y
  }
  cubic(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number) {
    const [left, right] = cubic(this.x, cx1, cx2, x), [top, bottom] = cubic(this.y, cy1, cy2, y)
    this.include(left, right, top, bottom)
    this.x = x; this.y = y
  }
  close() { this.x = this.startX; this.y = this.startY }
  ink(): readonly Ink[] { return this.snapshot ??= this.boxes.map(box => ({ ...box })) }
}
