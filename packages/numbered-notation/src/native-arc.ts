import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeStyle, nativeEm as em } from './native-style.js'
import type { NativeRelation, NativeSystem } from './native-layout.js'
import { nativeArcSlice, nativeArcInkLift } from './native-curve.js'
import { nativeTiePortTop } from './native-note-metrics.js'
import { placedNativeControlInk } from './native-controls.js'

export type NativeArcCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number }
  | { op: 'C'; cx1: number; cy1: number; cx2: number; cy2: number; x: number; y: number }
  | { op: 'Z' }
export type NativeArc = { commands: NativeArcCommand[]; left: number; right: number; top: number; height: number }

/** Closed musical ribbons in coordinates relative to the lane's baseline.
 * Measurement and SVG consume the same geometry, including split-line tails.
 */
export function nativeArcGeometry(relation: NativeRelation, system: NativeSystem): NativeArc {
  const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === relation.first.lane)
  const firstHere = members.includes(relation.first), lastHere = members.includes(relation.last)
  const selected = members.filter(glyph => relation.first.event && relation.last.event && glyph.event
    && relation.first.event.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event.sourceStart)
  const covered = selected.length ? selected : members
  const automaticHeight = (peer: NativeRelation) => {
    const ratio = Math.min(1, Math.abs(peer.last.x - peer.first.x) / em(55))
    return em(11) * ratio * (2 - ratio)
  }
  const peers = relation.arcGroup === undefined ? [relation] : system.relations.filter(peer =>
    peer.arcGroup === relation.arcGroup && members.includes(peer.first) && members.includes(peer.last))
  const height = firstHere && lastHere ? Math.max(automaticHeight(relation), ...peers.map(automaticHeight)) : em(9.9)
  const endpoints = [firstHere ? relation.first : undefined, lastHere ? relation.last : undefined].filter(glyph => glyph !== undefined)
  const port = -Math.max(0, ...(endpoints.length ? endpoints : covered).map(nativeTiePortTop))
  const thickness = nativeStyle.music * 0.09
  let commands: NativeArcCommand[] = []
  // A continuation begins at the music cell's allocated edge, just as its
  // open right end reaches the system boundary. Glyph side bearings must not
  // indent this edge; the real ink still participates in collision checks.
  const left = firstHere ? relation.first.x : system.arcContinuationLeft ?? Math.min(...members.map(glyph => glyph.x - (glyph.musicLeft ?? glyph.left)))
  const right = lastHere ? relation.last.x : system.measures.at(-1)!.end
  if (firstHere && lastHere) {
    const run = (right - left) / 4, outer = height * 4 / 3, inner = Math.max(0, height - thickness) * 4 / 3
    commands.push({ op: 'M', x: left, y: port },
      { op: 'C', cx1: left + run, cy1: port - outer, cx2: right - run, cy2: port - outer, x: right, y: port },
      { op: 'C', cx1: right - run, cy1: port - inner, cx2: left + run, cy2: port - inner, x: left, y: port }, { op: 'Z' })
  } else {
    // A closing continuation can end on the first note at a zero margin.
    // Shorten its horizontal turn instead of extending outside the canvas.
    const top = port - height, bottom = top + thickness, run = Math.min(height * 1.2, Math.max(0, right - left))
    if (firstHere) {
      commands.push({ op: 'M', x: left, y: port },
        { op: 'Q', cx: left + run * 0.45, cy: top, x: left + run, y: top },
        { op: 'L', x: right, y: top }, { op: 'L', x: right, y: bottom }, { op: 'L', x: left + run, y: bottom },
        { op: 'Q', cx: left + run * 0.45, cy: bottom, x: left, y: port }, { op: 'Z' })
    } else if (lastHere) {
      commands.push({ op: 'M', x: left, y: top }, { op: 'L', x: right - run, y: top },
        { op: 'Q', cx: right - run * 0.45, cy: top, x: right, y: port },
        { op: 'Q', cx: right - run * 0.45, cy: bottom, x: right - run, y: bottom },
        { op: 'L', x: left, y: bottom }, { op: 'Z' })
    } else commands.push({ op: 'M', x: left, y: top }, { op: 'L', x: right, y: top },
      { op: 'L', x: right, y: bottom }, { op: 'L', x: left, y: bottom }, { op: 'Z' })
  }
  // An interior note only needs to clear the ribbon at its actual horizontal
  // footprint. Its height must not become a new endpoint for the whole arc.
  let lift = 0
  for (const glyph of covered) {
    if (glyph === relation.first || glyph === relation.last) continue
    // The port belongs to the highest central musical primitive. Lower beams,
    // accidental padding and leading graces must not acquire that same height.
    const top = -(glyph.tieTop ?? glyph.musicTop ?? glyph.top)
    const tips = glyph.musicInk?.filter(piece => piece.left <= 0 && piece.right >= 0
      && Math.abs(piece.top - top) <= nativeStyle.music * 1e-6)
    const ranges = tips?.length ? tips.map(piece => ({ left: glyph.x + piece.left, right: glyph.x + piece.right }))
      : [{ left: glyph.x - (glyph.inkLeft ?? glyph.musicLeft ?? glyph.left), right: glyph.x + (glyph.inkRight ?? glyph.musicRight ?? glyph.right) }]
    for (const range of ranges) {
      const a = Math.max(left, range.left), b = Math.min(right, range.right)
      if (a > b) continue
      for (const x of [a, b]) {
        const slice = nativeArcSlice(commands, x)
        if (slice) lift = Math.max(lift, slice.bottom + nativeTiePortTop(glyph))
      }
    }
  }
  // Controls and side music clear only the actual ribbon intersections. A
  // meter's empty corners must not become a tall rectangular obstacle.
  lift = nativeArcInkLift(commands, left, right, members.flatMap(glyph => [
    ...(glyph.musicInk ?? []).map(piece => ({ ...piece, left: glyph.x + piece.left, right: glyph.x + piece.right })),
    ...glyph.controls.flatMap(placedNativeControlInk),
  ]), lift)
  if (lift > 0) commands = commands.map(command => {
    if (command.op === 'Z') return command
    if (command.op === 'C') return { ...command, y: command.y - lift, cy1: command.cy1 - lift, cy2: command.cy2 - lift }
    if (command.op === 'Q') return { ...command, y: command.y - lift, cy: command.cy - lift }
    return { ...command, y: command.y - lift }
  })
  return { commands, left, right, top: height - port + lift, height }
}

export function nativeArcPath(arc: NativeArc): string {
  return arc.commands.map(command => {
    if (command.op === 'Z') return 'Z'
    if (command.op === 'C') return `C${n(command.cx1)} ${n(command.cy1)} ${n(command.cx2)} ${n(command.cy2)} ${n(command.x)} ${n(command.y)}`
    if (command.op === 'Q') return `Q${n(command.cx)} ${n(command.cy)} ${n(command.x)} ${n(command.y)}`
    return `${command.op}${n(command.x)} ${n(command.y)}`
  }).join(' ')
}
