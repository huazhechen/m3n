import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { element, type Ink } from './layout-svg.js'
import { staffMusicSize } from './staff-music-font.js'

/** A tapered bow clears local ink with its lower curved edge. */
export function staffSlur(left: number, right: number, staffTop: number, obstacles: readonly Ink[], attachmentGap = scoreLayoutConfig.staff.attachmentGap,
  endpoints: { left: number; right: number } = { left: staffTop, right: staffTop }) {
  if (right <= left) return element('g', { class: 'slur' })
  const width = right - left, space = staffMusicSize() / 4, span = width / space
  const gap = attachmentGap / scoreLayoutConfig.staff.engine.scale
  const height = space * Math.min(2.4, Math.max(.9, .75 + .22 * Math.sqrt(span)))
  const thickness = space * Math.min(.28, .22 + .004 * span)
  // Endpoints follow high notes independently. Lift the lower endpoint only
  // when necessary to bound the slope; keep the bow above the staff rules.
  let start = Math.min(staffTop, endpoints.left) - gap
  let end = Math.min(staffTop, endpoints.right) - gap
  const maximumDelta = width * scoreLayoutConfig.staff.slurMaximumEndpointSlope
  start = Math.min(start, end + maximumDelta)
  end = Math.min(end, start + maximumDelta)
  const delta = end - start
  const curve = (t: number, rise: number) => start + delta * t - 3 * rise * t * (1 - t)
  // Both edges are convex quadratics because x is linear in t. The lower
  // edge's maximum on an obstacle interval is exactly at one of its ends.
  let lift = 0
  for (const obstacle of obstacles) {
    if (obstacle.right <= left || obstacle.left >= right) continue
    const a = Math.max(0, (obstacle.left - left) / width)
    const b = Math.min(1, (obstacle.right - left) / width)
    lift = Math.max(lift, Math.max(curve(a, height - thickness), curve(b, height - thickness)) + gap - obstacle.top)
  }
  start -= lift; end -= lift
  const path = element('path', { d: `M${left} ${start} C${left + width / 3} ${start + delta / 3 - height} ${right - width / 3} ${end - delta / 3 - height} ${right} ${end} C${right - width / 3} ${end - delta / 3 - height + thickness} ${left + width / 3} ${start + delta / 3 - height + thickness} ${left} ${start} Z`, fill: '#000' })
  // Bound every short slice analytically, including the shifted upper vertex.
  // The same exact curve drives both drawing and collision geometry.
  const count = Math.max(1, Math.ceil(width / scoreLayoutConfig.staff.engine.slurInkSlice))
  const boxes = Array.from({ length: count }, (_, i) => {
    const a = i / count, b = (i + 1) / count
    const peak = Math.max(a, Math.min(b, (3 * height - delta) / (6 * height)))
    return { left: left + width * a, right: left + width * b,
      top: curve(peak, height),
      bottom: Math.max(curve(a, height - thickness), curve(b, height - thickness)) }
  })
  path.pathInk = { d: path.attributes.d!, boxes }
  return element('g', { class: 'slur' }, [path])
}
