import { scoreLayoutConfig, type ScorePageBlock } from '@m3n/numbered-notation/layout'
import { staffDecorationClasses, staffAttachmentGap, staffInlineHeadingInset } from './system-layout.js'
import { STAFF_SCALE } from './line-layout.js'
import { SvgGeometry, findAll, hasClass, nodes, moveInk, overlapsX, union, type Ink, type MeasureText, type XmlNode } from './layout-svg.js'

const omitted = [...staffDecorationClasses, 'verse', 'slur', 'tie', 'staff-clef']
const eligible = ['dir', 'harm', 'fing', 'dynam', 'tempo', 'repeatMark', 'octave']

/** Single-staff optimistic geometry. An upper attachment can only move farther
 * up after anchoring to local music, a lower attachment only farther down.
 * Keep separate channels: its opposite edge is not a valid constraint.
 * This does not replace or approximate any geometry used by exact layout. */
export function staffSystemLowerBound(node: XmlNode, measureText: MeasureText, width: number, sectionHeadings: Set<string>, attachmentGap: number, rulesOnly = false, fixedMusic?: Ink[]): ScorePageBlock & { invariantHeightLowerBound: number } {
  const scale = STAFF_SCALE, style = scoreLayoutConfig.staff
  const geometry = new SvgGeometry(node, measureText, true)
  const firstMeasure = nodes(node).find(n => hasClass(n, 'measure'))
  const inlineHeading = sectionHeadings.has(firstMeasure?.attributes.id ?? '') ? undefined : findAll(node, n => hasClass(n, 'reh'))[0]
  const inset = inlineHeading ? staffInlineHeadingInset(inlineHeading, geometry) : 0
  const rules = findAll(node, n => hasClass(n, 'staff-line')).flatMap(rule => geometry.pieces(rule))
  // A supplied invariant subset can retain heads and fixed stems even when
  // legal direction trials move flexible stems and their dependent ink.
  const music = fixedMusic ?? (rulesOnly ? rules : geometry.withoutClasses(node, omitted))
  const staffMusic = fixedMusic ?? (rulesOnly ? rules : findAll(node, n => hasClass(n, 'staff')).flatMap(staff => geometry.withoutClasses(staff, omitted)))
  const core = union(rules.map(p => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale })))
  // Relax only the proof geometry to cover composition roundoff; final layout
  // still uses the original operations and coordinates. Shrink x intervals so
  // a bound cannot invent a collision at a rounded horizontal edge.
  const epsilon = 1e-7
  const positioned = (p: Ink): Ink => ({ left: (p.left + inset) * scale + epsilon, right: (p.right + inset) * scale - epsilon,
    top: p.top * scale + epsilon, bottom: p.bottom * scale - epsilon })
  let rawTop = core.top, rawBottom = core.bottom
  const fixed = music.map(p => {
    rawTop = Math.min(rawTop, p.top * scale); rawBottom = Math.max(rawBottom, p.bottom * scale)
    return positioned(p)
  }).filter(p => p.right > p.left)
  const topInk = [...fixed], bottomInk = [...fixed]
  for (const attachment of findAll(node, n => eligible.some(kind => hasClass(n, kind)))) {
    const ink = geometry.ink(attachment)
    if (ink.right <= ink.left || ink.bottom <= ink.top || ink.right - ink.left > (width - style.attachmentWrapInset) / scale) continue
    let dx = Math.max(0, -ink.left)
    if (ink.right + dx > width / scale) dx -= ink.right + dx - width / scale
    const below = hasClass(attachment, 'dynam') || attachment.attributes['data-m3n-below'] === 'true'
    const gap = staffAttachmentGap(attachment, attachmentGap)
    const local = (attachment.attributes['data-m3n-staff'] === undefined ? music : staffMusic)
      .filter(other => overlapsX(moveInk(ink, dx, 0), other, gap / 2))
    if (!local.length) continue
    const dy = below ? Math.max(...local.map(p => p.bottom)) + gap - ink.top : Math.min(...local.map(p => p.top)) - gap - ink.bottom
    for (const piece of geometry.pieces(attachment)) {
      const moved = moveInk(piece, dx, dy), bound = positioned(moved)
      if (below) rawBottom = Math.max(rawBottom, moved.bottom * scale)
      else rawTop = Math.min(rawTop, moved.top * scale)
      if (bound.right > bound.left) (below ? bottomInk : topInk).push(bound)
    }
  }
  const top = Math.min(core.top, ...topInk.map(p => p.top)), bottom = Math.max(core.bottom, ...bottomInk.map(p => p.bottom))
  // Height comparisons accept improvements strictly greater than 1e-7px.
  // Retain a separate scalar proof with a magnitude-dependent roundoff bound;
  // the more relaxed collision channels above keep their existing tolerance.
  const roundoff = 64 * Number.EPSILON * Math.max(1, Math.abs(rawTop), Math.abs(rawBottom))
  return { height: bottom - top, core, lowerBoundGeometry: { top, bottom, topInk, bottomInk },
    invariantHeightLowerBound: rawBottom - rawTop - roundoff }
}
