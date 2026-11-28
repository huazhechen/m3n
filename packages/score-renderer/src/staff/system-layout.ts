import { paginateStaffRows, type StaffHeaderSize } from './staff-row-pagination.js'
import { scorePageCollision, scorePageDistance, scoreLayoutConfig, scoreMaximumCoreGap, scoreHeaderGap, scoreLyricGapScale, type ScoreVerticalSpacing } from '@m3n/numbered-notation/layout'
import { SCORE_TEXT_FONT, interpolateScoreCoreGap } from '@m3n/numbered-notation'
import { numberedHeadingLines } from '@m3n/notation'
import {
  SvgGeometry, InkRangeIndex,
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

export type StaffSystem = { materializeInk?: () => void; node: XmlNode; pieces: Ink[]; spacingPieces: Ink[]; boundaryPieces?: Ink[]; edgePieces: Array<Ink & { gap: number }>; ink: Ink; core: Ink; section: boolean; staffSpacing: number; hasLyrics?: boolean; coreGapBefore?: number }
const style = scoreLayoutConfig.staff
export const staffDecorationClasses = [
  'reh', 'dir', 'harm', 'dynam', 'tempo', 'fing', 'ending', 'hairpin', 'octave', 'mNum',
  'fermata', 'breath', 'trill', 'mordent', 'repeatMark', 'm3n-tuplet-label', 'm3n-hairpin-row', 'm3n-ending-row',
]
const decorations = staffDecorationClasses
const decorationClass = new RegExp(`(?:^|\\s)(?:${decorations.join('|')})(?:\\s|$)`)
const isDecoration = (node: XmlNode) => Boolean(node.attributes.class && decorationClass.test(node.attributes.class))
/** Shared by exact placement and its one-sided proof geometry. */
export function staffAttachmentGap(attachment: XmlNode, attachmentGap: number): number {
  return (hasClass(attachment, 'harm') ? style.chordGap
    : ['reh', 'dir'].some(kind => hasClass(attachment, kind)) ? style.annotationGap : attachmentGap) / STAFF_SCALE
}
export function staffInlineHeadingInset(label: XmlNode, geometry: SvgGeometry): number {
  const content = textContent(label).replace(/[\t\r\n]/g, '').trim()
  return (geometry.measure(content, scoreLayoutConfig.staff.annotation, true).width + style.sectionLabelInset) / STAFF_SCALE
}
/** Resolve rhythm labels before enclosing slurs consume their geometry.
 * Re-running during attachment layout is idempotent: outer slurs never push
 * their own enclosed numeral away from its music. */
export function placeStaffTuplets(node: XmlNode, geometry: SvgGeometry,
  tuplets = findAll(node, child => hasClass(child, 'm3n-tuplet-label')), attachmentGap = style.attachmentGap) {
  const scale = STAFF_SCALE
  const rhythmObstacles = tuplets.length ? geometry.withoutClasses(node, [...decorations, 'verse', 'slur']) : []
  const tupletMusic = new Map<XmlNode, Ink[]>()
  for (const staff of tuplets.length ? findAll(node, n => hasClass(n, 'staff')) : []) {
    const labels = nodes(staff).filter(n => tuplets.includes(n))
    if (!labels.length) continue
    const music = geometry.withoutClasses(staff, [...decorations, 'verse', 'slur'])
    for (const label of labels) tupletMusic.set(label, music)
  }
  for (const label of tuplets) {
    const below = label.attributes['data-m3n-below'] === 'true', clearance = attachmentGap / scale
    // Re-anchor bracket strokes and numeral to this staff before
    // resolving collisions with the actual local music.
    const localMusic = tupletMusic.get(label)!
    const pieces = geometry.pieces(label)
    const closeMusic = localMusic
    const closeObstacles = rhythmObstacles
    const offsets = pieces.flatMap(piece => closeMusic
      .filter(other => overlapsX(piece, other, clearance / 2))
      .map(other => below ? other.bottom - piece.top + clearance : other.top - piece.bottom - clearance))
    let dy = offsets.length ? (below ? Math.max(...offsets) : Math.min(...offsets)) : 0
    const intervals = pieces.flatMap(piece => closeObstacles
      .filter(other => overlapsX(piece, other, clearance / 2))
      .map(other => ({ start: other.top - piece.bottom - clearance, end: other.bottom - piece.top + clearance })))
      .sort((a, b) => below ? a.start - b.start : b.end - a.end)
    for (const interval of intervals)
      if (dy > interval.start && dy < interval.end) dy = below ? interval.end : interval.start
    if (dy) translate(label, 0, dy)
    rhythmObstacles.push(...geometry.pieces(label))
  }
}
/** Operate on independent attachments. Musical geometry is never stretched.
 * Empty verse containers remain available for interaction but reserve no ink. */
export function arrangeStaffSystem(
  node: XmlNode,
  geometry: SvgGeometry,
  width: number,
  sectionHeadings: Set<string>,
  deferPieces = false,
  tupletsPlaced = false,
  attachmentGap = style.attachmentGap,
): StaffSystem {
  const inkIndices = new WeakMap<Ink[], InkRangeIndex>()
  const nearby = (music: Ink[], pieces: readonly Ink[], gap: number) => {
    if (music.length < 256 || !pieces.length) return music
    let index = inkIndices.get(music)
    if (!index) { index = new InkRangeIndex(music); inkIndices.set(music, index) }
    return index.query(Math.min(...pieces.map(p => p.left)), Math.max(...pieces.map(p => p.right)), gap)
  }
  const classes = new Map<string, XmlNode[]>()
  const wanted = new Set(['reh', 'dir', 'harm', 'verse', 'm3n-tuplet-label', 'staff-line', 'ending', 'mNum', 'staff-clef'])
  const interesting = /(?:^|\s)(?:reh|dir|harm|verse|m3n-tuplet-label|staff-line|ending|mNum|staff-clef)(?:\s|$)/
  let needsArrangement = false
  const index = (child: XmlNode) => {
    if (isDecoration(child) || hasClass(child, 'verse') || child.attributes['data-staff'] === 'bass') needsArrangement = true
    const raw = child.attributes.class
    if (raw && interesting.test(raw)) for (const name of raw.split(/\s+/)) if (wanted.has(name)) {
      let members = classes.get(name)
      if (!members) { members = []; classes.set(name, members) }
      members.push(child)
    }
    // Prepared numeric events contain only note primitives, never movable
    // attachments or staff rules. Those are appended outside the event.
    if (!child.preparedMusicInk) for (const member of child.children) if (typeof member !== 'string') index(member)
  }
  index(node)
  const byClass = (name: string) => classes.get(name) ?? []
  // With no movable attachments or lyrics, every arrangement pass is a
  // no-op. Collect the final exact partition directly, including when the
  // paginator consumes it immediately; do not compile a one-use music tree.
  if (!needsArrangement) return finishStaffSystem(node, geometry, byClass, 0, deferPieces, attachmentGap)
  geometry.compileStatic(node, n => isDecoration(n) || hasClass(n, 'verse'), [...decorations, 'verse'])
  const scale = STAFF_SCALE,
    gap = attachmentGap / scale
  for (const label of byClass('reh'))
    for (const text of findAll(label, (n) => n.tagName === 'text' || n.tagName === 'tspan'))
      text.attributes['font-size'] = String(scoreLayoutConfig.staff.annotation / scale)
  for (const attachment of [...new Set(['reh', 'dir', 'harm'].flatMap(byClass))]) {
    const ink = geometry.ink(attachment)
    if (ink.right - ink.left <= (width - style.attachmentWrapInset) / scale) continue
    const text = findAll(attachment, (n) => n.tagName === 'text')[0]
    if (!text) continue
    const size = Math.max(
      scoreLayoutConfig.staff.text / scale,
      ...findAll(text, (n) => Boolean(n.attributes['font-size'])).map((n) => parseFloat(n.attributes['font-size']!)),
    )
    const bold = hasClass(attachment, 'reh')
    const measurer = {
      measureText: (value: string, style: { fontSize: number }) => ({
        w: geometry.measure(value, style.fontSize, bold).width,
      }),
    }
    const lines = numberedHeadingLines(textContent(attachment), (width - style.attachmentWrapInset) / scale, size, measurer, bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.regularWeight)
    const x = Number(text.attributes.x ?? 0),
      y = Number(text.attributes.y ?? 0)
    attachment.children = lines.map((line, i) =>
      element(
        'text',
        {
          x: String(x),
          y: String(y + i * size),
          'font-size': String(size),
          'font-family': SCORE_TEXT_FONT,
          ...(bold ? { 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) } : {}),
        },
        [line],
      ),
    )
  }
  // Rhythm labels belong between music and lyrics. Position them before
  // packing verses, so a later collision pass cannot push a numeral below text.
  const tuplets = new Set(byClass('m3n-tuplet-label'))
  const isMovableDecoration = (n: XmlNode) => isDecoration(n) && !tuplets.has(n)
  // The engine resolves rhythm labels before adding slurs. Everything added
  // afterwards is excluded by that pass, so repeating it sees identical music.
  if (!tupletsPlaced) placeStaffTuplets(node, geometry, [...tuplets], attachmentGap)
  const verses = byClass('verse')
  for (const verse of verses) if (!textContent(verse).replace(/[\s\u200B\u2800]/g, '')) verse.children = []
  // Pack actual lyric ink for each staff independently, with no phantom row
  // for trailing placeholders. The engine's music and bass staves stay intact.
  const measures = nodes(node).filter((n) => hasClass(n, 'measure'))
  for (const measure of byClass('mNum').length ? measures : []) {
    if (measure !== measures.at(-1)) {
      const removeNumbers = (parent: XmlNode) => {
        parent.children = parent.children.filter((child) => typeof child === 'string' || !hasClass(child, 'mNum'))
        nodes(parent).forEach(removeNumbers)
      }
      removeNumbers(measure)
    } else {
      const bars = findAll(measure, (n) => hasClass(n, 'staff-bar'))
      if (bars.length)
        for (const number of findAll(measure, (n) => hasClass(n, 'mNum'))) {
          const barInk = union(bars.flatMap((bar) => geometry.pieces(bar)))
          const ink = geometry.ink(number)
          number.children.unshift(element('rect', { x: String(ink.left - style.measureNumberPadding / scale), y: String(ink.top - style.measureNumberPadding / scale), width: String(ink.right - ink.left + style.measureNumberPadding / scale), height: String(ink.bottom - ink.top + 2 * style.measureNumberPadding / scale), fill: '#fff' }))
          translate(number, barInk.right - ink.right, barInk.top - style.measureNumberBarGap / scale - ink.bottom)
        }
    }
  }
  const staffsByMeasure = measures.map(m => nodes(m).filter(n => hasClass(n, 'staff')))
  const lanes = Math.max(0, ...staffsByMeasure.map(staffs => staffs.length))
  let staffSpacing = 0
  for (let lane = 0; lane < lanes; lane++) {
    const staffs = staffsByMeasure.flatMap(staffs => staffs[lane] ?? [])
    const rows = new Map<number, XmlNode[]>()
    for (const staff of staffs)
      for (const verse of findAll(staff, (n) => hasClass(n, 'verse') && n.children.length > 0)) {
        const row = Number(/-v(\d+)/.exec(verse.attributes.id ?? '')?.[1] ?? 1)
        const members = rows.get(row)
        if (members) members.push(verse)
        else rows.set(row, [verse])
      }
    if (lane + 1 < lanes) {
      const music = staffs.flatMap(staff => geometry.withoutClasses(staff, ['verse']))
      const next = staffsByMeasure.flatMap(staves => staves[lane + 1] ?? [])
        .flatMap(staff => geometry.withoutClasses(staff, ['verse']))
      for (const piece of music) for (const other of nearby(next, [piece], gap / 2))
        if (overlapsX(piece, other, gap / 2)) staffSpacing = Math.max(staffSpacing, piece.bottom + gap - other.top)
    }
    if (!rows.size) continue
    const music = staffs.flatMap(staff => geometry.withoutClasses(staff, ['verse']))
    const lyricPieces = [...rows.values()].flatMap(row => row.flatMap(verse => geometry.pieces(verse)))
    // A clef tail or isolated low note outside the lyric columns must not
    // lower the whole verse. Staff rules preserve the common reading baseline.
    const rules = staffs.flatMap(staff => findAll(staff, child => hasClass(child, 'staff-line')).flatMap(rule => geometry.pieces(rule)))
    const musicBottom = Math.max(...rules.map(piece => piece.bottom),
      ...music.filter(piece => lyricPieces.some(lyric => overlapsX(piece, lyric, gap / 2))).map(piece => piece.bottom))
    let bottom = Number.isFinite(musicBottom) ? musicBottom : union(music).bottom
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      const members = rows.get(row)!,
        bounds = union(members.flatMap((v) => geometry.pieces(v)))
      const dy = bottom + style.lyricGap / scale - bounds.top
      members.forEach((v) => translate(v, 0, dy))
      bottom = bounds.bottom + dy
    }
    if (lane + 1 < lanes) {
      const next = staffsByMeasure.flatMap(staffs => staffs[lane + 1] ?? [])
      const nextInk = union(next.flatMap((staff) => geometry.pieces(staff)))
      const shift = Math.max(0, bottom + style.lyricGap / scale - nextInk.top)
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
        item.node.attributes['data-m3n-staff'] === other.node.attributes['data-m3n-staff'] &&
        Math.abs(center - (other.ink.top + other.ink.bottom) / 2) <= style.attachmentRowTolerance / scale &&
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
      measure.children.push(element('g', { class: 'm3n-hairpin-row', ...(row[0]!.node.attributes['data-m3n-staff'] === undefined ? {} : { 'data-m3n-staff': row[0]!.node.attributes['data-m3n-staff']! }) }, row.map((item) => item.node)))
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
  // Endings and other attachments use the same music obstacles. Rows without
  // either need no intermediate collection; the final partition still runs.
  let endingObstacles: Ink[] | undefined
  const musicObstacles = () => endingObstacles ??= geometry.withoutClasses(node, decorations.filter(name => name !== 'm3n-tuplet-label'))
  for (const row of endingRows) {
    const top = Math.min(...row.map(({ ink }) => ink.top))
    let right = Number.NEGATIVE_INFINITY
    for (const { ending, ink } of [...row].sort((a, b) => a.ink.left - b.ink.left)) {
      const dx = Math.max(0, right + gap - ink.left)
      translate(ending, dx, top - ink.top)
      right = Math.max(right, ink.right + dx)
    }

    if (row.length > 1) {
      row.forEach(({ ending }) => groupedEndings.add(ending))
      node.children = node.children.filter((child) => typeof child === 'string' || !row.some((item) => item.ending === child))
      node.children.push(element('g', { class: 'm3n-ending-row' }, row.map(({ ending }) => ending)))
    }
  }
  const isHairpin = (attachment: XmlNode) => hasClass(attachment, 'hairpin') || hasClass(attachment, 'm3n-hairpin-row')
  const hairpinPieces = new Set<Ink>()
  // Keep brackets and curves inside expression
  // markings. Text is moved only when its actual horizontal span collides.
  const isStandaloneHeading = (attachment: XmlNode) =>
    hasClass(attachment, 'reh') && sectionHeadings.has(measures[0]?.attributes.id ?? '')
  const hasStandaloneHeading = sectionHeadings.has(measures[0]?.attributes.id ?? '')
  const inlineHeading = hasStandaloneHeading ? undefined : byClass('reh')[0]
  const isHeadingTempo = (attachment: XmlNode) => hasStandaloneHeading && hasClass(attachment, 'tempo')
  const placementOrder = (attachment: XmlNode) =>
    isHeadingTempo(attachment) ? 4 : isStandaloneHeading(attachment) ? 3 :
      hasClass(attachment, 'repeatMark') ? 2 : hasClass(attachment, 'ending') || hasClass(attachment, 'm3n-ending-row') ? 1 : hasClass(attachment, 'tempo') ? .5 : isHairpin(attachment) ? -1 : 0
  // Keep the section's directions next to its melody: tempo above heading,
  // heading above directions, then music. Ordinary tempo is outside octave
  // lines; place those outer levels last as well.
  const attachments = findAll(node, (n) => isMovableDecoration(n) && !hasClass(n, 'mNum') && !groupedHairpins.has(n) && !groupedEndings.has(n)).sort(
    (a, b) => placementOrder(a) - placementOrder(b),
  )
  const music = attachments.length ? musicObstacles() : []
  const obstacles = [...music]
  const placedDecorations: Array<{ lane?: number; pieces: Ink[] }> = []
  const upperOctaves: Ink[] = []
  const laneMusic = new Map<number, Ink[]>()
  const belowMusic = (lane: number) => {
    let pieces = laneMusic.get(lane)
    if (!pieces) {
      pieces = staffsByMeasure.flatMap(staffs => staffs[lane]
        ? geometry.withoutClasses(staffs[lane]!, decorations.filter(name => name !== 'm3n-tuplet-label')) : [])
      for (const slur of nodes(node).filter(n => hasClass(n, 'slur') && n.attributes['data-m3n-staff'] === String(lane)))
        pieces.push(...geometry.pieces(slur))
      laneMusic.set(lane, pieces)
    }
    return pieces
  }
  for (const attachment of attachments) {
    let ink = geometry.ink(attachment)
    if (ink.right === ink.left && ink.bottom === ink.top) continue
    // Rehearsal frames are painted ink: include their padding and stroke in
    // placement before solving clearance against music and other text.
    if (hasClass(attachment, 'reh')) {
      const padding = style.attachmentFramePadding / scale
      attachment.children.unshift(element('rect', {
        x: String(ink.left - padding), y: String(ink.top - padding),
        width: String(ink.right - ink.left + padding * 2),
        height: String(ink.bottom - ink.top + padding * 2),
        fill: 'none', stroke: '#000', 'stroke-width': String(style.frameStroke / scale),
      }))
      ink = geometry.ink(attachment)
    }
    // This framed label is moved beside the stave after attachment placement.
    // Its temporary position above the music must not lift tempo or directions.
    if (attachment === inlineHeading) continue
    let dx = Math.max(0, -ink.left)
    if (ink.right + dx > width / scale) dx -= ink.right + dx - width / scale
    let dy = 0
    const below = hasClass(attachment, 'dynam') || isHairpin(attachment) || attachment.attributes['data-m3n-below'] === 'true'
    const standalone = isStandaloneHeading(attachment)
    const localGap = staffAttachmentGap(attachment, attachmentGap)
    const attachmentLane = attachment.attributes['data-m3n-staff']
    const lane = attachmentLane === undefined ? undefined : Number(attachmentLane)
    const localUpperText = lanes === 1 && ['dir', 'harm', 'fing'].some(kind => hasClass(attachment, kind))
    if (localUpperText || hasClass(attachment, 'tempo') || hasClass(attachment, 'repeatMark') || hasClass(attachment, 'octave') || (below && (lanes === 1 || attachmentLane !== undefined))) {
      // Start next to the local music, then let the normal ink avoidance
      // clear stems, curves and directions instead of preserving a fixed gap.
      const local = (attachmentLane !== undefined ? belowMusic(Number(attachmentLane)) : music)
        .filter(other => overlapsX(moveInk(ink, dx, 0), other, localGap / 2))
      if (local.length) dy = below
        ? Math.max(...local.map(other => other.bottom)) + localGap - ink.top
        : Math.min(...local.map(other => other.top)) - localGap - ink.bottom
    }
    if (standalone || isHeadingTempo(attachment)) dy = union(obstacles).top - localGap - ink.bottom
    // Consecutive wedges may share a baseline with a small real gap between
    // their endpoints; horizontal padding must not invent a second lane.
    const attachmentPieces = geometry.pieces(attachment).map(piece => moveInk(piece, dx, 0))
    const placementObstacles = below && lane !== undefined
      ? [...Array.from({ length: lane + 1 }, (_, index) => belowMusic(index)).flat(),
        ...placedDecorations.filter(item => item.lane === undefined || item.lane <= lane).flatMap(item => item.pieces)] : obstacles
    const ending = hasClass(attachment, 'ending') || hasClass(attachment, 'm3n-ending-row')
    const clearance = localGap
    const closePlacement = nearby(placementObstacles, attachmentPieces, clearance / 2)
    if (hasClass(attachment, 'tempo')) {
      // Octave lines belong to the notes. Tempo is always outside a crossed
      // upper octave line, even if the inner gap could fit the text.
      for (const octave of upperOctaves)
        if (overlapsX(moveInk(ink, dx, 0), octave, clearance / 2)) dy = Math.min(dy, octave.top - ink.bottom - clearance)
    }
    if (ending) {
      // Empty space underneath a volta's horizontal rule is not ink. Let
      // high notes and slurs fit there when they clear the hooks and number.
      const offsets = attachmentPieces.flatMap(piece => closePlacement
        .filter(other => overlapsX(piece, other, clearance / 2))
        .map(other => other.top - piece.bottom - clearance))
      if (offsets.length) dy = Math.min(...offsets)
    }
    const intervals = attachmentPieces.flatMap(piece => closePlacement
      .filter(other => overlapsX(piece, other, isHairpin(attachment) && hairpinPieces.has(other) ? 0 : clearance / 2))
      .map(other => ({ start: other.top - piece.bottom - clearance, end: other.bottom - piece.top + clearance })))
      .sort((a, b) => below ? a.start - b.start : b.end - a.end)
    for (const interval of intervals)
      if (dy > interval.start && dy < interval.end) dy = below ? interval.end : interval.start
    if (dx || dy) translate(attachment, dx, dy)
    ink = moveInk(ink, dx, dy)
    const placed = geometry.pieces(attachment)
    obstacles.push(...placed)
    if (hasClass(attachment, 'octave') && !below) upperOctaves.push(...placed)
    placedDecorations.push({ lane, pieces: placed })
    if (below && lane !== undefined && lane + 1 < lanes) {
      // Open the inter-staff space instead of letting a treble expression
      // escape underneath the bass staff when its intended lane is crowded.
      for (const piece of placed) for (const next of belowMusic(lane + 1))
        if (overlapsX(piece, next, clearance / 2)) staffSpacing = Math.max(staffSpacing, piece.bottom + clearance - next.top)
    }
    if (isHairpin(attachment)) placed.forEach((piece) => hairpinPieces.add(piece))
  }
  for (let lane = 1; lane < lanes; lane++) {
    const above = [...belowMusic(lane - 1), ...placedDecorations
      .filter(item => item.lane === lane - 1).flatMap(item => item.pieces)]
    const below = findAll(node, child => hasClass(child, 'slur') && child.attributes['data-m3n-staff'] === String(lane))
      .flatMap(slur => geometry.pieces(slur))
    for (const piece of below) for (const other of nearby(above, [piece], gap / 2))
      if (overlapsX(piece, other, gap / 2)) staffSpacing = Math.max(staffSpacing, other.bottom + gap - piece.top)
  }
  if (inlineHeading) {
    const label = inlineHeading,
      ink = geometry.ink(label)
    const inset = staffInlineHeadingInset(label, geometry)
    const staff = measures[0] && nodes(measures[0]).find((n) => hasClass(n, 'staff'))
    const lines = staff ? nodes(staff).filter((n) => hasClass(n, 'staff-line')) : []
    const center = lines.length
      ? (geometry.ink(lines[0]!).top + geometry.ink(lines.at(-1)!).bottom) / 2
      : (ink.top + ink.bottom) / 2
    translate(label, style.headingLeftInset / scale - ink.left, center - (ink.top + ink.bottom) / 2)
    const detach = (parent: XmlNode) => {
      parent.children = parent.children.filter((child) => child !== label)
      nodes(parent).forEach(detach)
    }
    detach(node)
    node.children = [element('g', { transform: `translate(${inset} 0)` }, node.children), label]
  }
  return finishStaffSystem(node, geometry, byClass, staffSpacing, deferPieces, attachmentGap)
}
function finishStaffSystem(node: XmlNode, geometry: SvgGeometry, byClass: (name: string) => XmlNode[],
  staffSpacing: number, deferPieces: boolean, attachmentGap: number): StaffSystem {
  const scale = STAFF_SCALE
  // The stave itself is the stable core. Notes, lyrics and controls only
  // enlarge a particular row gap when their actual ink requires clearance.
  const core = union(byClass('staff-line').flatMap(rule => geometry.pieces(rule))
    .map(p => ({ left: p.left * scale, right: p.right * scale, top: p.top * scale, bottom: p.bottom * scale })))
  const result: StaffSystem = { node, pieces: [], spacingPieces: [], edgePieces: [],
    ink: { left: 0, right: 0, top: 0, bottom: 0 }, core,
    section: Boolean(byClass('reh').length), staffSpacing, hasLyrics: byClass('verse').some(verse => verse.children.length > 0) }
  const materialize = () => {
    const partition = geometry.partitionScaledWithoutClasses(node, ['mNum', 'staff-clef'], scale, byClass('staff-clef').length ? ['staff-clef'] : undefined)
    // The shared paginator already sees ordinary music ink. Only symbols
    // excluded from row spacing need the separate page-boundary channel.
    const pieces = partition.all, spacingPieces = partition.without, boundaryPieces = partition.boundary
    const edgePieces = partition.selected.map(p => ({ ...p, gap: attachmentGap }))
    result.pieces = pieces; result.spacingPieces = spacingPieces; result.boundaryPieces = boundaryPieces; result.edgePieces = edgePieces
    result.ink = union(pieces)
    result.materializeInk = undefined
  }
  if (deferPieces) {
    const ink = geometry.ink(node)
    result.ink = { left: ink.left * scale, right: ink.right * scale, top: ink.top * scale, bottom: ink.bottom * scale }
    result.materializeInk = materialize
  } else materialize()
  return result
}
/** Public adjacent-row distance uses the same collision rule as pagination. */
export function systemDistance(previous: StaffSystem, next: StaffSystem, gap: number, minimum = gap, maximum = gap): number {
  previous.materializeInk?.(); next.materializeInk?.()
  const coreGap = next.coreGapBefore ?? interpolateScoreCoreGap(minimum, maximum, gap, previous.hasLyrics ? scoreLyricGapScale(minimum) : 1)
  const shape = (system: StaffSystem) => ({ ink: system.spacingPieces.slice().sort((a,b)=>a.left-b.left),
    boundaryInk: system.boundaryPieces ?? system.pieces, edgeInk: system.edgePieces })
  const pair = scorePageCollision(shape(previous), shape(next))
  return scorePageDistance(pair, coreGap, previous.core.bottom + coreGap - next.core.top)
}
export type StaffPage = { systems: StaffSystem[]; ys: number[]; height: number; gap: number; verticalCost?: number }
export function paginateStaff(systems: StaffSystem[], height: number, headerHeight: StaffHeaderSize, minimum: number,
  paged: boolean, maximum = scoreMaximumCoreGap(minimum), headerGap = scoreHeaderGap(minimum), vertical?: ScoreVerticalSpacing, pageCeiling?: number): StaffPage[] {
  return paginateStaffRows(systems, height, headerHeight, minimum, paged, maximum, headerGap, vertical, pageCeiling)
}
