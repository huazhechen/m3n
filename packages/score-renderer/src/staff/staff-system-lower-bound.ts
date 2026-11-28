import { scoreLayoutConfig, type ScorePageBlock } from '@m3n/numbered-notation/layout'
import { staffDecorationClasses, staffAttachmentGap, staffInlineHeadingInset } from './system-layout.js'
import { STAFF_SCALE } from './line-layout.js'
import { SvgGeometry, findAll, hasClass, nodes, moveInk, overlapsX, union, textContent, inkBottomAlongX, type Ink, type MeasureText, type XmlNode } from './layout-svg.js'

const omitted = [...staffDecorationClasses, 'verse', 'slur', 'tie', 'staff-clef']
const eligible = ['dir', 'harm', 'fing', 'dynam', 'tempo', 'repeatMark', 'octave']
const indexedClasses = [...eligible, 'reh', 'staff-line', 'staff', 'verse']
const indexedClassSet = new Set(indexedClasses)

/** Single-staff optimistic geometry. An upper attachment can only move farther
 * up after anchoring to local music, a lower attachment only farther down.
 * Keep separate channels: its opposite edge is not a valid constraint.
 * This does not replace or approximate any geometry used by exact layout. */
export function staffSystemLowerBound(node: XmlNode, measureText: MeasureText, width: number, sectionHeadings: Set<string>, attachmentGap: number, rulesOnly = false, fixedMusic?: Ink[]): ScorePageBlock & { invariantHeightLowerBound: number } {
  const scale = STAFF_SCALE, style = scoreLayoutConfig.staff
  const geometry = new SvgGeometry(node, measureText, true)
  // The proof needs a small subset of the row tree. Scan once, then filter
  // that subset; unadorned music no longer pays for separate full-tree walks.
  const indexed = findAll(node, child => {
    const raw = child.attributes.class
    return Boolean(raw && (indexedClassSet.has(raw)
      || /\s/.test(raw) && indexedClasses.some(name => hasClass(child, name))))
  })
  const byClass = (name: string) => indexed.filter(child => hasClass(child, name))
  const staves = byClass('staff')
  const firstMeasure = nodes(node).find(n => hasClass(n, 'measure'))
  const inlineHeading = sectionHeadings.has(firstMeasure?.attributes.id ?? '') ? undefined : byClass('reh')[0]
  const inset = inlineHeading ? staffInlineHeadingInset(inlineHeading, geometry) : 0
  const rules = byClass('staff-line').flatMap(rule => geometry.pieces(rule))
  // A supplied invariant subset can retain heads and fixed stems even when
  // legal direction trials move flexible stems and their dependent ink.
  const music = fixedMusic ?? (rulesOnly ? rules : geometry.withoutClasses(node, omitted))
  const staffMusic = fixedMusic ?? (rulesOnly ? rules : staves.flatMap(staff => geometry.withoutClasses(staff, omitted)))
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
  // Lyrics are packed below local music before attachments move. Their
  // horizontal spans and row heights do not depend on beam directions. An
  // invariant music subset therefore gives a lower baseline for every row.
  // Only bottoms are constraints: exact music may move the lyrics down.
  if (byClass('verse').length && !staves.some(staff => staff.attributes['data-staff'] === 'bass')
    && nodes(node).filter(n => hasClass(n, 'measure')).every(m => nodes(m).filter(n => hasClass(n, 'staff')).length <= 1)) {
    const rows = new Map<number, Ink[]>()
    for (const staff of staves) for (const verse of findAll(staff, n => hasClass(n, 'verse') && n.children.length > 0)) {
      if (!textContent(verse).replace(/[\s\u200B\u2800]/g, '')) continue
      const row = Number(/-v(\d+)/.exec(verse.attributes.id ?? '')?.[1] ?? 1)
      let pieces = rows.get(row)
      if (!pieces) { pieces = []; rows.set(row, pieces) }
      pieces.push(...geometry.pieces(verse))
    }
    if (rows.size) {
      const lyrics = [...rows.values()].flat()
      const bottom = inkBottomAlongX(music, lyrics, attachmentGap / scale / 2, Math.max(...rules.map(piece => piece.bottom)))
      let baseline = Number.isFinite(bottom) ? bottom : union(music).bottom
      for (const row of [...rows.keys()].sort((a, b) => a - b)) {
        const pieces = rows.get(row)!, bounds = union(pieces)
        const dy = baseline + style.lyricGap / scale - bounds.top
        for (const piece of pieces) {
          const moved = moveInk(piece, 0, dy), bound = positioned(moved)
          rawBottom = Math.max(rawBottom, moved.bottom * scale)
          if (bound.right > bound.left) bottomInk.push(bound)
        }
        baseline = bounds.bottom + dy
      }
    }
  }
  for (const attachment of indexed.filter(n => eligible.some(kind => hasClass(n, kind)))) {
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
