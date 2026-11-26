import { svgPathBbox } from 'svg-path-bbox'
import { StaffPathAxis } from './staff-path-ink.js'
import type { Ink } from './layout-svg.js'

export type StaffNumericPath = { boxes: readonly Ink[]; text(): string; end: { x: number; y: number }; place(x: number, y: number): StaffNumericPath }
export type StaffPathCommand = { kind: number; values: number[] }
export function staffCommandPath(commands: readonly StaffPathCommand[], x = 0, y = 0): StaffNumericPath {
  return new CommandPath(commands, x, y)
}
const rounded = (value: number, precision: number) => Math.round(value * precision) / precision + 0
/** Staff rules, stems and ledger lines need only one rounded segment. */
export function staffLinePath(x1: number, y1: number, x2: number, y2: number): StaffNumericPath {
  return new LinePath(x1, y1, x2, y2)
}
class LinePath implements StaffNumericPath {
  readonly boxes: readonly Ink[]
  readonly end: { x: number; y: number }
  private serialized?: string
  constructor(private readonly x1: number, private readonly y1: number, private readonly x2: number, private readonly y2: number, private readonly x = 0, private readonly y = 0) {
    const a = rounded(x + x1, 1000), b = rounded(y + y1, 1000), c = rounded(x + x2, 1000), d = rounded(y + y2, 1000)
    this.boxes = [{ left: Math.min(a, c), right: Math.max(a, c), top: Math.min(b, d), bottom: Math.max(b, d) }]
    this.end = { x: c, y: d }
  }
  text(): string {
    return this.serialized ??= `M${rounded(this.x + this.x1, 1000)} ${rounded(this.y + this.y1, 1000)}L${rounded(this.x + this.x2, 1000)} ${rounded(this.y + this.y2, 1000)}`
  }
  place(x: number, y: number): StaffNumericPath {
    return new LinePath(this.x1, this.y1, this.x2, this.y2, this.x + x, this.y + y)
  }
}
function commandAxis(commands: readonly StaffPathCommand[], origin: number, offset: number, precision: number): StaffPathAxis {
  const geometry = new StaffPathAxis()
  for (const { kind, values } of commands) {
    if (kind === 4) { geometry.close(); continue }
    const a = rounded(origin + values[offset]!, precision)
    if (kind === 0) geometry.move(a)
    else if (kind === 1) geometry.line(a)
    else if (kind === 2) geometry.quadratic(a, rounded(origin + values[offset + 2]!, precision))
    else geometry.cubic(a, rounded(origin + values[offset + 2]!, precision), rounded(origin + values[offset + 4]!, precision))
  }
  return geometry
}

/** Shared prototype methods keep candidate paths free of per-instance closures. */
class CommandPath implements StaffNumericPath {
  readonly boxes: readonly Ink[]
  readonly end: { x: number; y: number }
  private serialized?: string
  private verticalAxis?: StaffPathAxis
  private readonly precision = 1000
  constructor(private readonly commands: readonly StaffPathCommand[], private readonly x: number, private readonly y: number, private vertical?: Map<number, StaffPathAxis>,
    private readonly linear = commands.every(command => command.kind === 0 || command.kind === 1 || command.kind === 4)) {
    const precision = this.precision
    if (commands[0]?.kind === 5 && commands.slice(1).every(command => command.kind === 4)) {
      const [cx, cy, radius] = commands[0]!.values as [number, number, number]
      const x0 = rounded(x + cx + radius, precision), y0 = rounded(y + cy, precision)
      const x1 = rounded(x + cx + radius * Math.cos(Math.PI), precision), y1 = rounded(y + cy + radius * Math.sin(Math.PI), precision), r = rounded(radius, precision)
      const d = `M${x0} ${y0} A${r} ${r} 0 0 0 ${x1} ${y1} A${r} ${r} 0 0 0 ${x0} ${y0}${'Z'.repeat(commands.length - 1)}`
      const [left, top, right, bottom] = svgPathBbox(d)
      this.boxes = [{ left, top, right, bottom }]; this.end = { x: x0, y: y0 }; this.serialized = d
      return
    }
    if (this.linear) {
      const boxes: Ink[] = []
      let current: Ink | undefined, endX = NaN, endY = NaN, startX = NaN, startY = NaN
      for (const { kind, values } of commands) {
        if (kind === 4) { endX = startX; endY = startY; continue }
        endX = rounded(x + values[0]!, precision); endY = rounded(y + values[1]!, precision)
        if (kind === 0) {
          startX = endX; startY = endY
          current = { left: endX, right: endX, top: endY, bottom: endY }; boxes.push(current)
        } else {
          if (!current) throw new Error('五线谱路径缺少起点。')
          current.left = Math.min(current.left, endX); current.right = Math.max(current.right, endX)
          current.top = Math.min(current.top, endY); current.bottom = Math.max(current.bottom, endY)
        }
      }
      this.boxes = boxes; this.end = { x: endX, y: endY }; return
    }
    const horizontal = commandAxis(commands, x, 0, precision)
    let verticalAxis = vertical?.get(y)
    if (!verticalAxis) { verticalAxis = commandAxis(commands, y, 1, precision); vertical?.set(y, verticalAxis) }
    this.boxes = horizontal.ranges.map((range, i) => ({ left: range.min, right: range.max,
      top: verticalAxis!.ranges[i]!.min, bottom: verticalAxis!.ranges[i]!.max }))
    this.verticalAxis = verticalAxis
    this.end = { x: horizontal.end, y: verticalAxis.end }
  }
  place(dx: number, dy: number): StaffNumericPath {
    if (!this.vertical && this.verticalAxis) this.vertical = new Map([[this.y, this.verticalAxis]])
    return new CommandPath(this.commands, this.x + dx, this.y + dy, this.vertical, this.linear)
  }
  text(): string {
    const { x, y, precision } = this
    return this.serialized ??= this.commands.map(({ kind, values }) => {
      if (kind === 4) return 'Z'
      const points: string[] = []
      for (let i = 0; i < values.length; i += 2) points.push(`${rounded(x + values[i]!, precision)} ${rounded(y + values[i + 1]!, precision)}`)
      return ['M', 'L', 'Q', 'C'][kind]! + points.join(',')
    }).join('')
  }
}
