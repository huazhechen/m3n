import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { element, type Ink } from './layout-svg.js'
import { staffMusicSize } from './staff-music-font.js'

/** A tapered bow clears local ink with its lower curved edge. */
export function staffSlur(left: number, right: number, staffTop: number, obstacles: readonly Ink[], attachmentGap = scoreLayoutConfig.staff.attachmentGap) {
  if (right <= left) return element('g', { class: 'slur' })
  const space = staffMusicSize() / 4, span = (right - left) / space
  // Short bows remain compact; long phrases gain a bounded rise instead of
  // looking like a horizontal rule. Scale the ribbon with the same frame.
  const gap = attachmentGap / scoreLayoutConfig.staff.engine.scale
  const height = space * Math.min(2.4, Math.max(.9, .75 + .22 * Math.sqrt(span)))
  const thickness = space * Math.min(.28, .22 + .004 * span)
  // Clear the lower edge of the actual bow at each obstacle's x span.
  // Raising the whole baseline above every obstacle and then adding
  // the bow height reserves the same vertical clearance twice.
  const y = Math.min(staffTop - gap, ...obstacles.map(p => {
    const a = Math.max(0, Math.min(1, (p.left - left) / (right - left)))
    const b = Math.max(0, Math.min(1, (p.right - left) / (right - left)))
    const lowerRise = 3 * (height - thickness) * Math.min(a * (1 - a), b * (1 - b))
    return p.top - gap + lowerRise
  }))
  const path = element('path', { d: `M${left} ${y} C${left + (right - left) / 3} ${y - height} ${right - (right - left) / 3} ${y - height} ${right} ${y} C${right - (right - left) / 3} ${y - height + thickness} ${left + (right - left) / 3} ${y - height + thickness} ${left} ${y} Z`, fill: '#000' })
  // The controls divide x evenly, so x is linear in t and the two
  // edges are y - 3*h*t*(1-t). Bound short slices exactly; a volta
  // number near an endpoint must not avoid the curve's distant peak.
  const count = Math.max(1, Math.ceil(Math.abs(right - left) / scoreLayoutConfig.staff.engine.slurInkSlice))
  const boxes = Array.from({ length: count }, (_, i) => {
    const a = i / count, b = (i + 1) / count
    const peak = Math.max(a, Math.min(b, 0.5))
    return { left: left + (right - left) * a, right: left + (right - left) * b,
      top: y - 3 * height * peak * (1 - peak),
      bottom: y - 3 * (height - thickness) * Math.min(a * (1 - a), b * (1 - b)) }
  })
  path.pathInk = { d: path.attributes.d!, boxes }
  return element('g', { class: 'slur' }, [path])
}
