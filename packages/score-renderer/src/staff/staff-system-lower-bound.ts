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
export function staffSystemLowerBound(node: XmlNode, measureText: MeasureText, width: number, sectionHeadings: Set<string>, attachmentGap: number, rulesOnly = false): ScorePageBlock {
  const scale = STAFF_SCALE, style = scoreLayoutConfig.staff
  const geometry = new SvgGeometry(node, measureText, true)
  const firstMeasure = nodes(node).find(n => hasClass(n, 'measure'))
  const inlineHeading = sectionHeadings.has(firstMeasure?.attributes.id ?? '') ? undefined : findAll(node, n => hasClass(n, 'reh'))[0]
  const inset = inlineHeading ? staffInlineHeadingInset(inlineHeading, geometry) : 0
  const rules = findAll(node, n => hasClass(n, 'staff-line')).flatMap(rule => geometry.pieces(rule))
  // Flexible beam directions can move stems and their dependent ink. Staff
  // rules and local text anchoring remain valid for every direction trial.
  const music = rulesOnly ? rules : geometry.withoutClasses(node, omitted)
  const staffMusic = rulesOnly ? rules : findAll(node, n => hasClass(n, 'staff')).flatMap(staff => geometry.withoutClasses(staff, omitted))
  const core = union(rules.map(p => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale })))
  // Relax only the proof geometry to cover composition roundoff; final layout
  // still uses the original operations and coordinates. Shrink x intervals so
  // a bound cannot invent a collision at a rounded horizontal edge.
  const epsilon = 1e-7
  const positioned = (p: Ink): Ink => ({ left: (p.left + inset) * scale + epsilon, right: (p.right + inset) * scale - epsilon,
    top: p.top * scale + epsilon, bottom: p.bottom * scale - epsilon })
  const fixed = music.map(positioned).filter(p => p.right > p.left)
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
      const bound = positioned(moveInk(piece, dx, dy))
      if (bound.right > bound.left) (below ? bottomInk : topInk).push(bound)
    }
  }
  const top = Math.min(core.top, ...topInk.map(p => p.top)), bottom = Math.max(core.bottom, ...bottomInk.map(p => p.bottom))
  return { height: bottom - top, core, lowerBoundGeometry: { top, bottom, topInk, bottomInk } }
}
