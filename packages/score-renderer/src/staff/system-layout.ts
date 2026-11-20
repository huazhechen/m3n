import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { numberedHeadingLines } from '@m3n/notation'
import {
  SvgGeometry,
  findAll,
  nodes,
  hasClass,
  element,
  textContent,
  translate,
  union,
  moveInk,
  overlapsX,
  type Ink,
  type XmlNode,
} from './layout-svg.js'
import { STAFF_SCALE } from './line-layout.js'

export type StaffSystem = { node: XmlNode; pieces: Ink[]; spacingPieces: Ink[]; edgePieces: Array<Ink & { gap: number }>; ink: Ink; core: Ink; section: boolean; staffSpacing: number }
const decorations = [
  'reh', 'dir', 'harm', 'dynam', 'tempo', 'fing', 'ending', 'hairpin', 'octave', 'mNum',
  'fermata', 'breath', 'trill', 'mordent', 'repeatMark', 'm3n-tuplet-label', 'm3n-hairpin-row', 'm3n-ending-row',
]
const isDecoration = (node: XmlNode) => decorations.some((c) => hasClass(node, c))
function filtered(node: XmlNode, omit: (node: XmlNode) => boolean): XmlNode {
  return {
    ...node,
    children: node.children
      .filter((child) => typeof child === 'string' || !omit(child))
      .map((child) => (typeof child === 'string' ? child : filtered(child, omit))),
  }
}
/** Operate on independent attachments. Musical geometry is never stretched.
 * Empty verse containers remain available for interaction but reserve no ink. */
export function arrangeStaffSystem(
  node: XmlNode,
  geometry: SvgGeometry,
  width: number,
  sectionHeadings: Set<string>,
): StaffSystem {
  const scale = STAFF_SCALE,
    gap = 6 / scale
  // Keep a tuplet's number and split bracket together while clearing beams.
  for (const tuplet of findAll(node, (n) => hasClass(n, 'tuplet'))) {
    const labels = nodes(tuplet).filter((n) => hasClass(n, 'tupletNum') || hasClass(n, 'tupletBracket'))
    if (!labels.length) continue
    const music = union(nodes(tuplet).filter((n) => !labels.includes(n)).flatMap((n) => geometry.pieces(n)))
    const label = union(labels.flatMap((n) => geometry.pieces(n)))
    tuplet.children = tuplet.children.filter((child) => typeof child === 'string' || !labels.includes(child))
    tuplet.children.push(element('g', {
      class: 'm3n-tuplet-label',
      'data-m3n-below': String(label.top + label.bottom > music.top + music.bottom),
    }, labels))
  }
  for (const label of findAll(node, (n) => hasClass(n, 'reh')))
    for (const text of findAll(label, (n) => n.tagName === 'text' || n.tagName === 'tspan'))
      text.attributes['font-size'] = String(16 / scale)
  for (const attachment of findAll(node, (n) => ['reh', 'dir', 'harm'].some((c) => hasClass(n, c)))) {
    const ink = geometry.ink(attachment)
    if (ink.right - ink.left <= (width - 12) / scale) continue
    const text = findAll(attachment, (n) => n.tagName === 'text')[0]
    if (!text) continue
    const size = Math.max(
      16 / scale,
      ...findAll(text, (n) => Boolean(n.attributes['font-size'])).map((n) => parseFloat(n.attributes['font-size']!)),
    )
    const bold = hasClass(attachment, 'reh')
    const measurer = {
      measureText: (value: string, style: { fontSize: number }) => ({
        w: geometry.measure(value, style.fontSize, bold).width,
      }),
    }
    const lines = numberedHeadingLines(textContent(attachment), (width - 12) / scale, size, measurer, bold ? 700 : 400)
    const x = Number(text.attributes.x ?? 0),
      y = Number(text.attributes.y ?? 0)
    attachment.children = lines.map((line, i) =>
      element(
        'text',
        {
          x: String(x),
          y: String(y + i * size * 1.25),
          'font-size': String(size),
          'font-family': SCORE_TEXT_FONT,
          ...(bold ? { 'font-weight': 'bold' } : {}),
        },
        [line],
      ),
    )
  }
  const verses = findAll(node, (n) => hasClass(n, 'verse'))
  for (const verse of verses) if (!textContent(verse).replace(/[\s\u200B\u2800]/g, '')) verse.children = []
  // Pack actual lyric ink for each staff independently, with no phantom row
  // for trailing placeholders. The engine's music and bass staves stay intact.
  const measures = nodes(node).filter((n) => hasClass(n, 'measure'))
  for (const measure of measures) {
    if (measure !== measures.at(-1)) {
      const removeNumbers = (parent: XmlNode) => {
        parent.children = parent.children.filter((child) => typeof child === 'string' || !hasClass(child, 'mNum'))
        nodes(parent).forEach(removeNumbers)
      }
      removeNumbers(measure)
    } else {
      const bars = findAll(measure, (n) => hasClass(n, 'barLine'))
      if (bars.length)
        for (const number of findAll(measure, (n) => hasClass(n, 'mNum'))) {
          const right = union(bars.flatMap((bar) => geometry.pieces(bar))).right
          translate(number, right - geometry.ink(number).right, 0)
        }
    }
  }
  const lanes = Math.max(0, ...measures.map((m) => nodes(m).filter((n) => hasClass(n, 'staff')).length))
  let staffSpacing = 0
  for (let lane = 0; lane < lanes; lane++) {
    const staffs = measures.flatMap((m) => nodes(m).filter((n) => hasClass(n, 'staff'))[lane] ?? [])
    const rows = new Map<number, XmlNode[]>()
    for (const staff of staffs)
      for (const verse of findAll(staff, (n) => hasClass(n, 'verse') && n.children.length > 0)) {
        const row = Number(/-v(\d+)/.exec(verse.attributes.id ?? '')?.[1] ?? 1)
        rows.set(row, [...(rows.get(row) ?? []), verse])
      }
    if (!rows.size) continue
    const body = union(staffs.flatMap((staff) => geometry.pieces(filtered(staff, (n) => hasClass(n, 'verse')))))
    let bottom = body.bottom
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      const members = rows.get(row)!,
        bounds = union(members.flatMap((v) => geometry.pieces(v)))
      const dy = bottom + (bottom === body.bottom ? 6 : 4) / scale - bounds.top
      members.forEach((v) => translate(v, 0, dy))
      bottom = bounds.bottom + dy
    }
    if (lane + 1 < lanes) {
      const next = measures.flatMap((m) => nodes(m).filter((n) => hasClass(n, 'staff'))[lane + 1] ?? [])
      const nextInk = union(next.flatMap((staff) => geometry.pieces(staff)))
      const shift = Math.max(0, bottom + 12 / scale - nextInk.top)
      if (shift) {
        // Reopen the complete grand staff before drawing connecting barlines.
        staffSpacing = Math.max(staffSpacing, shift)
      }
    }
  }
  const groupedHairpins = new Set<XmlNode>()
  // Align sequential wedges on the same local lane and clear music as one
  // unit. Independent placement otherwise follows each note's vertical ink.
  for (const measure of measures) {
    const hairpins = nodes(measure).filter((n) => hasClass(n, 'hairpin'))
      .map((node) => ({ node, ink: geometry.ink(node) }))
      .sort((a, b) => a.ink.left - b.ink.left)
    const rows: typeof hairpins[] = []
    for (const item of hairpins) {
      const center = (item.ink.top + item.ink.bottom) / 2
      const row = rows.find((row) => row.every((other) =>
        Math.abs(center - (other.ink.top + other.ink.bottom) / 2) <= 10 / scale &&
        !overlapsX(item.ink, other.ink)))
      if (row) row.push(item)
      else rows.push([item])
    }
    for (const row of rows.filter((row) => row.length > 1)) {
      const center = Math.max(...row.map(({ ink }) => (ink.top + ink.bottom) / 2))
      for (const { node, ink } of row) {
        translate(node, 0, center - (ink.top + ink.bottom) / 2)
        groupedHairpins.add(node)
      }
      measure.children = measure.children.filter((child) =>
        typeof child === 'string' || !row.some((item) => item.node === child))
      measure.children.push(element('g', { class: 'm3n-hairpin-row' }, row.map((item) => item.node)))
    }
  }
  const groupedEndings = new Set<XmlNode>()
  const endings = nodes(node).filter((child) => hasClass(child, 'ending'))
    .map((ending) => ({ ending, ink: geometry.ink(ending) }))
    .filter(({ ink }) => ink.right > ink.left && ink.bottom > ink.top)
    .sort((a, b) => a.ink.left - b.ink.left)
  const endingRows: typeof endings[] = []
  for (const item of endings) {
    const row = endingRows.find((row) => row.every((other) => !overlapsX(item.ink, other.ink)))
    if (row) row.push(item)
    else endingRows.push([item])
  }
  const endingObstacles = geometry.pieces(filtered(node, isDecoration))
  for (const row of endingRows) {
    const top = Math.min(...row.map(({ ink }) => ink.top))
    let right = Number.NEGATIVE_INFINITY
    const arranged: Array<{ ending: XmlNode; ink: Ink }> = []
    for (const { ending, ink } of [...row].sort((a, b) => a.ink.left - b.ink.left)) {
      const dx = Math.max(0, right + 3.5 / scale - ink.left)
      translate(ending, dx, top - ink.top)
      right = Math.max(right, ink.right + dx)
      arranged.push({ ending, ink: moveInk(ink, dx, top - ink.top) })
    }
    const clearances = arranged.flatMap(({ ink }) => endingObstacles
      .filter((other) => overlapsX(ink, other) && other.top >= ink.bottom)
      .map((other) => other.top - ink.bottom))
    const dy = clearances.length ? Math.max(0, Math.min(...clearances) - 5 / scale) + 3 / scale : 0
    if (dy) for (const { ending } of arranged) translate(ending, 0, dy)
    if (row.length > 1) {
      row.forEach(({ ending }) => groupedEndings.add(ending))
      node.children = node.children.filter((child) => typeof child === 'string' || !row.some((item) => item.ending === child))
      node.children.push(element('g', { class: 'm3n-ending-row' }, row.map(({ ending }) => ending)))
    }
  }
  const isHairpin = (attachment: XmlNode) => hasClass(attachment, 'hairpin') || hasClass(attachment, 'm3n-hairpin-row')
  const music = geometry.pieces(filtered(node, isDecoration))
  const obstacles = [...music]
  const hairpinPieces = new Set<Ink>()
  // Keep brackets and curves inside expression
  // markings. Text is moved only when its actual horizontal span collides.
  const isStandaloneHeading = (attachment: XmlNode) =>
    hasClass(attachment, 'reh') && sectionHeadings.has(measures[0]?.attributes.id ?? '')
  const hasStandaloneHeading = sectionHeadings.has(measures[0]?.attributes.id ?? '')
  const isHeadingTempo = (attachment: XmlNode) => hasStandaloneHeading && hasClass(attachment, 'tempo')
  const placementOrder = (attachment: XmlNode) =>
    isHeadingTempo(attachment) ? 4 : isStandaloneHeading(attachment) ? 3 :
      hasClass(attachment, 'mNum') ? 2 : hasClass(attachment, 'ending') || hasClass(attachment, 'm3n-ending-row') ? 1 : isHairpin(attachment) ? -1 : 0
  // Keep the section's directions next to its melody: tempo above heading,
  // heading above directions, then music. Place the outer levels last.
  const attachments = findAll(node, (n) => isDecoration(n) && !groupedHairpins.has(n) && !groupedEndings.has(n)).sort(
    (a, b) => placementOrder(a) - placementOrder(b),
  )
  for (const attachment of attachments) {
    let ink = geometry.ink(attachment)
    if (ink.right === ink.left && ink.bottom === ink.top) continue
    const padding = hasClass(attachment, 'reh') ? 4 / scale : 0
    let dx = Math.max(0, padding - ink.left)
    if (ink.right + dx + padding > width / scale) dx -= ink.right + dx + padding - width / scale
    let dy = hasClass(attachment, 'ending') || hasClass(attachment, 'm3n-ending-row') ? Infinity : 0
    if (!Number.isFinite(dy)) {
      const below = obstacles.filter(other => overlapsX(ink, other) && other.top >= ink.bottom)
      dy = below.length ? Math.min(...below.map(p => p.top)) - ink.bottom - 2 / scale : 0
    }
    const below = hasClass(attachment, 'dynam') || isHairpin(attachment) || attachment.attributes['data-m3n-below'] === 'true'
    const standalone = isStandaloneHeading(attachment)
    if (standalone || isHeadingTempo(attachment)) dy = union(obstacles).top - 12 / scale - ink.bottom
    if (hasClass(attachment, 'mNum')) {
      const endings = findAll(node, (n) => hasClass(n, 'ending'))
        .map((ending) => geometry.ink(ending))
        .filter((ending) => ending.right > ending.left && ending.bottom > ending.top && overlapsX(ink, ending))
      if (endings.length) dy = Math.min(0, Math.min(...endings.map((ending) => ending.top)) - 8 / scale - ink.bottom)
    }
    // Consecutive wedges may share a baseline with a small real gap between
    // their endpoints; horizontal padding must not invent a second lane.
    const attachmentPieces = geometry.pieces(attachment).map(piece => moveInk(piece, dx, 0))
    const ending = hasClass(attachment, 'ending') || hasClass(attachment, 'm3n-ending-row')
    const clearance = ending ? 2 / scale : gap
    const intervals = attachmentPieces.flatMap(piece => obstacles
      .filter(other => overlapsX(piece, other, isHairpin(attachment) && hairpinPieces.has(other) ? 0 : clearance / 2))
      .map(other => ({ start: other.top - piece.bottom - clearance, end: other.bottom - piece.top + clearance })))
      .sort((a, b) => below ? a.start - b.start : b.end - a.end)
    for (const interval of intervals)
      if (dy > interval.start && dy < interval.end) dy = below ? interval.end : interval.start
    if (dx || dy) translate(attachment, dx, dy)
    ink = moveInk(ink, dx, dy)
    if (hasClass(attachment, 'reh')) {
      const padding = 4 / scale
      attachment.children.unshift(
        element('rect', {
          x: String(ink.left - dx - padding),
          y: String(ink.top - dy - padding),
          width: String(ink.right - ink.left + padding * 2),
          height: String(ink.bottom - ink.top + padding * 2),
          fill: 'none',
          stroke: '#000',
          'stroke-width': String(1 / scale),
        }),
      )
    }
    const placed = geometry.pieces(attachment)
    obstacles.push(...placed)
    if (isHairpin(attachment)) placed.forEach((piece) => hairpinPieces.add(piece))
  }
  const inline = findAll(node, (n) => hasClass(n, 'reh')).filter(
    () => !sectionHeadings.has(measures[0]?.attributes.id ?? ''),
  )
  if (inline.length) {
    const label = inline[0]!,
      ink = geometry.ink(label)
    const content = textContent(label)
      .replace(/[\t\r\n]/g, '')
      .trim()
    const inset = (geometry.measure(content, 16, true).width + 21) / scale
    const staff = measures[0] && nodes(measures[0]).find((n) => hasClass(n, 'staff'))
    const lines = staff ? nodes(staff).filter((n) => n.tagName === 'path') : []
    const center = lines.length
      ? (geometry.ink(lines[0]!).top + geometry.ink(lines.at(-1)!).bottom) / 2
      : (ink.top + ink.bottom) / 2
    translate(label, 0.5 / scale - ink.left, center - (ink.top + ink.bottom) / 2)
    const detach = (parent: XmlNode) => {
      parent.children = parent.children.filter((child) => child !== label)
      nodes(parent).forEach(detach)
    }
    detach(node)
    node.children = [element('g', { transform: `translate(${inset} 0)` }, node.children), label]
  }
  const pieces = geometry
    .pieces(node)
    .map((p) => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale }))
  // The stave itself is the stable core. Notes, lyrics and controls only
  // enlarge a particular row gap when their actual ink requires clearance.
  const core = union(findAll(node, n => hasClass(n, 'staff-line')).flatMap(rule => geometry.pieces(rule))
    .map(p => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale })))
  const spacingPieces = geometry.pieces(filtered(node, child => hasClass(child, 'ending') || hasClass(child, 'mNum')))
    .map((p) => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale }))
  const edgePieces = findAll(node, child => hasClass(child, 'ending') || hasClass(child, 'mNum')).flatMap(child =>
    geometry.pieces(child).map(p => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale, gap: hasClass(child, 'mNum') ? 4 : 2 })))
  return { node, pieces, spacingPieces, edgePieces, ink: union(pieces), core, section: Boolean(findAll(node, (n) => hasClass(n, 'reh')).length), staffSpacing }
}
const distances = new WeakMap<StaffSystem, WeakMap<StaffSystem, number>>()
export function systemDistance(previous: StaffSystem, next: StaffSystem, gap: number): number {
  let following = distances.get(previous)
  if (!following) {
    following = new WeakMap()
    distances.set(previous, following)
  }
  let collision = following.get(next)
  if (collision === undefined) {
    collision = -Infinity
    for (const a of previous.spacingPieces)
      for (const b of next.spacingPieces) if (overlapsX(a, b)) collision = Math.max(collision, a.bottom - b.top)
    following.set(next, collision)
  }
  let edgeCollision = -Infinity
  for (const a of previous.pieces) for (const b of next.edgePieces) if (overlapsX(a, b)) edgeCollision = Math.max(edgeCollision, a.bottom - b.top + b.gap)
  for (const a of previous.edgePieces) for (const b of next.spacingPieces) if (overlapsX(a, b)) edgeCollision = Math.max(edgeCollision, a.bottom - b.top + a.gap)
  return Math.max(previous.core.bottom + gap - next.core.top, collision + gap / 2, edgeCollision) + (next.section ? 12 : 0)
}
export type StaffPage = { systems: StaffSystem[]; ys: number[]; height: number; gap: number }
function positions(systems: StaffSystem[], start: number, gap: number) {
  if (!systems.length) return []
  const ys = [start - systems[0]!.ink.top]
  for (let i = 1; i < systems.length; i++) ys.push(ys[i - 1]! + systemDistance(systems[i - 1]!, systems[i]!, gap))
  return ys
}
export function paginateStaff(
  systems: StaffSystem[],
  height: number,
  headerHeight: number,
  minimum: number,
  paged: boolean,
): StaffPage[] {
  if (!paged) {
    const ys = positions(systems, headerHeight, minimum)
    return [
      { systems, ys, height: Math.max(headerHeight, ...systems.map((s, i) => s.ink.bottom + ys[i]!)), gap: minimum },
    ]
  }
  const pages: StaffPage[] = []
  for (const system of systems) {
    let page = pages.at(-1)
    if (!page) {
      page = { systems: [], ys: [], height, gap: minimum }
      pages.push(page)
    }
    const start = pages.length === 1 ? headerHeight : 0
    const members = [...page.systems, system],
      ys = positions(members, start, minimum)
    if (system.ink.bottom + ys.at(-1)! > height + 1e-6) {
      if (!page.systems.length) throw new Error('单个五线谱谱行无法放入A4页面。')
      const y = -system.ink.top
      if (system.ink.bottom + y > height) throw new Error('单个五线谱谱行无法放入A4页面。')
      pages.push({ systems: [system], ys: [y], height, gap: minimum })
    } else {
      page.systems = members
      page.ys = ys
    }
  }
  for (const [index, page] of pages.entries()) {
    let lo = minimum,
      hi = Math.max(minimum, 32)
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2,
        ys = positions(page.systems, index === 0 ? headerHeight : 0, mid)
      if (page.systems.at(-1)!.ink.bottom + ys.at(-1)! <= height) lo = mid
      else hi = mid
    }
    page.gap = lo
    page.ys = positions(page.systems, index === 0 ? headerHeight : 0, lo)
  }
  return pages
}
