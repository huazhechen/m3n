import { ASTFunctionNode, ANCHOR_KEY, getLayoutBounds, isLayoutAttachment, renderLayoutPagesToSvg, type ASTNodeBase, type CompileScoreResult, type VisualTemporalNode } from '@m3n/jpfun'
import { parse, stringify, type TNode } from 'txml/txml'
import { NUMBER_FONT_CSS } from './font-data.js'
import type { EventBinding, ProjectedScore } from './projection.js'

type Located = { binding: EventBinding; line: number; node: VisualTemporalNode }
function isOpeningRepeat(node: VisualTemporalNode): boolean {
  if (node.ast instanceof ASTFunctionNode && node.ast.callName === 'bar') {
    return (node.ast as ASTFunctionNode & { type?: number }).type === 3
  }
  if (!(node.ast instanceof ASTFunctionNode) || !['up', 'down'].includes(node.ast.callName)) return false
  const host = (node as VisualTemporalNode & { members?: readonly VisualTemporalNode[] }).members?.[0]
  return host && host !== node ? isOpeningRepeat(host) : false
}
const spanKey = (span: { start: number; end: number }) => `${span.start}:${span.end}`
function labelBinding(node: VisualTemporalNode, projection: ProjectedScore) {
  const selected = node.ast instanceof ASTFunctionNode && node.ast.labelable ? node.ast.labelable() : null
  if (selected?.label && projection.bindings.has(selected.label)) return projection.bindings.get(selected.label)
  for (let ast: ASTNodeBase | null = node.ast; ast; ast = ast.parent) {
    if (ast instanceof ASTFunctionNode && ast.label) {
      const binding = projection.bindings.get(ast.label)
      if (binding) return binding
    }
  }
  return undefined
}

/** Adds interaction structure around jpFun output; never draws or moves music glyphs. */
export function renderInteractivePages(result: CompileScoreResult, projection: ProjectedScore): string[] {
  const voltaSpans = new Set(result.lowering.attachments.filter(isLayoutAttachment)
    .filter(attachment => attachment.spacingRole === 'volta' && attachment.sourceSpan)
    .map(attachment => spanKey(attachment.sourceSpan!)))
  const voltaLines = new Set(result.layout.attachments.filter(attachment => attachment.sourceSpan && voltaSpans.has(spanKey(attachment.sourceSpan)))
    .flatMap(attachment => attachment.regions.flatMap(region => region.line === undefined ? [] : [region.line])))
  // Global relationships are painted outside g.system; retain their native line
  // ownership so external pagination cannot leave an ending above the wrong page.
  const systemBounds = new Map<number, { top: number; bottom: number }>()
  const include = (line: number, box: { y: number; h: number }) => {
    const bounds = systemBounds.get(line)
    systemBounds.set(line, { top: Math.min(bounds?.top ?? Infinity, box.y), bottom: Math.max(bounds?.bottom ?? -Infinity, box.y + box.h) })
  }
  for (const node of result.layout.objects) include(node.layoutLine, getLayoutBounds(node))
  for (const attachment of result.layout.attachments) for (const region of attachment.regions) {
    if (region.line !== undefined) include(region.line, region)
  }
  const located = new Map<VisualTemporalNode, Located>()
  const sourceTargets = new Map<string, Located>()
  for (const node of result.layout.objects) {
    const binding = labelBinding(node, projection)
    if (!binding) continue
    const value = { binding, line: node.layoutLine, node }
    located.set(node, value); sourceTargets.set(spanKey(node.ast.sourceSpan), value)
  }
  const objectLocations = new Map<number, Located>()
  const objectsByTrack = new Map<VisualTemporalNode['track'], Located[]>()
  for (const value of located.values()) {
    const group = objectsByTrack.get(value.node.track) ?? []
    group.push(value); objectsByTrack.set(value.node.track, group)
  }
  const native = renderLayoutPagesToSvg(result.layout, {
    background: '#fff',
    objectAttributes(node): Record<string, string> | undefined {
      if (node.ast instanceof ASTFunctionNode && (node.ast.label === 'rangeLow' || node.ast.label === 'rangeHigh')) {
        return { 'data-m3n-role': node.ast.label === 'rangeLow' ? 'pitch-range-low' : 'pitch-range-high' }
      }
      const value = located.get(node)
      if (value) {
        objectLocations.set(node.order, value)
        return {
          class: 'note', id: value.binding.visualId, 'data-m3n-id': value.binding.xmlId,
          ...(value.binding.passes ? {'data-m3n-passes':value.binding.passes.join('-')} : {}),
          ...(value.binding.sustain ? { 'data-m3n-role': 'sustain' } : {}),
          'data-jpfun-object': String(node.order), 'data-m3n-system': String(value.line), 'data-m3n-measure': value.binding.measureId,
        }
      }
      const candidates = objectsByTrack.get(node.track) ?? []
      const openingRepeat = isOpeningRepeat(node)
      const previous = candidates.filter(value => node.mergeKey === ANCHOR_KEY && !openingRepeat ? value.node.t.compare(node.t) < 0 : value.node.t.compare(node.t) <= 0).at(-1)
      const next = candidates.find(value => value.node.t.compare(node.t) >= 0 && value.node.ast.sourceSpan.start < node.ast.sourceSpan.end)
      const framedHeading = node.ast instanceof ASTFunctionNode && node.ast.callName === 'text' && 'frame' in node.ast && node.ast.frame
      const related = framedHeading ? candidates.find(value => value.node.t.equals(node.t) && value.line === node.layoutLine) : previous ?? next
      if (!related || !framedHeading && node.ast.sourceSpan.start < Math.min(...candidates.map(value => value.node.ast.sourceSpan.start))) return undefined
      const current = { ...related, node, line: node.layoutLine }
      objectLocations.set(node.order, current)
      return { 'data-jpfun-object': String(node.order), 'data-m3n-system': String(node.layoutLine), 'data-m3n-measure': related.binding.measureId, ...(framedHeading ? { 'data-m3n-id': related.binding.xmlId, 'data-m3n-role': 'section' } : {}) }
    },
    textAttributes(style) {
      const semantic = style.semantic
      if (!semantic) return undefined
      const target = sourceTargets.get(spanKey(semantic.sourceSpan))
      if (!target) return undefined
      if (semantic.role === 'annotation' || semantic.role === 'mark') return {
        'data-m3n-id': target.binding.xmlId, 'data-m3n-role': semantic.role,
        'data-m3n-system': String(target.line), 'data-m3n-measure': target.binding.measureId,
      }
      const rowIndex = semantic.row
      if (rowIndex === undefined) return undefined
      const row = projection.rows[rowIndex] ?? rowIndex
      const data = target.binding.lyrics.get(row)
      return {
        'data-m3n-id': target.binding.xmlId, 'data-m3n-role': semantic.role, 'data-m3n-rendition': String(row + 1),
        'data-m3n-passes': data?.passes ? [...data.passes].join('-') : String(row + 1),
        'data-m3n-system': String(target.line), 'data-m3n-measure': target.binding.measureId,
        ...(semantic.underlined ? { 'data-m3n-underlined': 'true' } : {}),
      }
    },
    paintAttributes(style) {
      const semantic = style.semantic
      const target = semantic?.role === 'mark' && sourceTargets.get(spanKey(semantic.sourceSpan))
      return target ? {
        'data-m3n-id': target.binding.xmlId, 'data-m3n-role': 'mark',
        'data-m3n-system': String(target.line), 'data-m3n-measure': target.binding.measureId,
      } : undefined
    },
  })
  const seenMeasures = new Set<string>()
  const lineEnds = new Map<number, VisualTemporalNode>()
  for (const { node, binding } of located.values()) if (binding.staff === 'melody' && !node.T.isZero()) {
    const previous = lineEnds.get(node.layoutLine)
    if (!previous || node.t.compare(previous.t) > 0) lineEnds.set(node.layoutLine, node)
  }
  return native.map((svg, pageIndex) => {
    const root = parse(svg).find((item): item is TNode => typeof item !== 'string' && item.tagName === 'svg')!
    root.attributes['data-engine'] = 'jpfun'
    // Numbers belong to closing bars; automatic wrapping is known only after
    // layout. Retain the number only when no melody event follows on that row.
    if (projection.measureNumbers) for (const child of root.children) {
      if (typeof child === 'string') continue
      const object = objectLocations.get(Number(child.attributes['data-jpfun-object']))
      if (!object || !/@text\("\d+",size=10px\)/.test(projection.source.slice(object.node.ast.sourceSpan.start, object.node.ast.sourceSpan.end))) continue
      const last = lineEnds.get(object.line)
      const closing = last && object.node.t.compare(last.t) > 0
      const filter = (node: TNode) => {
        node.children = node.children.filter(item => {
          if (typeof item === 'string') return true
          if (item.tagName === 'text' && item.attributes['font-size'] === '10' && /^\d+$/.test(item.children.join(''))) {
            item.attributes['data-m3n-role'] = 'measure-number'
            return Boolean(closing)
          }
          filter(item); return true
        })
      }
      filter(child)
    }
    // Header cells are painted by @head as separate frame/text primitives.
    // Group each pair without moving either primitive, and identify the order
    // occurrence rather than its (possibly repeated) section name.
    let orderIndex = 0
    const claimedFrames = new Set<TNode>()
    root.children = root.children.map(child => {
      if (typeof child === 'string' || child.tagName !== 'text' || child.attributes['font-size'] !== '16'
        || child.attributes['font-weight'] !== '700' || child.children.join('') !== projection.orderLabels?.[orderIndex]) return child
      const x = Number(child.attributes.x), y = Number(child.attributes.y)
      const frame = root.children.find((item): item is TNode => typeof item !== 'string' && item.tagName === 'rect' && item.attributes.fill === 'none'
        && Number(item.attributes.x) <= x && Number(item.attributes.x) + Number(item.attributes.width) >= x
        && Number(item.attributes.y) < y && Number(item.attributes.y) + Number(item.attributes.height) > y)
      if (!frame) return child
      claimedFrames.add(frame); child.attributes['data-m3n-role'] = 'order'
      return { tagName: 'g', attributes: { 'data-m3n-order-index': String(orderIndex++) }, children: [frame, child] } satisfies TNode
    }).filter(child => typeof child === 'string' || !claimedFrames.has(child))
    const systems = new Map<string, TNode>()
    const measures = new Map<string, TNode>()
    const openingRepeatMeasures = new Set<TNode>()
    const remaining: Array<TNode | string> = []
    for (const child of root.children) {
      if (typeof child === 'string') { remaining.push(child); continue }
      const systemIndex = child.attributes['data-m3n-system']
      const measureId = child.attributes['data-m3n-measure']
      if (systemIndex === undefined || systemIndex === null || !measureId) { remaining.push(child); continue }
      const key = `${systemIndex}:${measureId}`
      let system = systems.get(systemIndex)
      if (!system) {
        const paragraphs = [...new Set(result.layout.objects.filter(node => node.layoutLine === Number(systemIndex) && !node.T.isZero()).map(node => node.addon?.systemHeightGroup ?? ''))]
        const bounds = systemBounds.get(Number(systemIndex))!
        system = { tagName: 'g', attributes: { class: 'system', id: `m3n-system-${pageIndex + 1}-${systemIndex}`, 'data-m3n-volta': String(voltaLines.has(Number(systemIndex))), 'data-m3n-paragraph': paragraphs.join(','), 'data-m3n-top': String(bounds.top), 'data-m3n-bottom': String(bounds.bottom) }, children: [] }
        systems.set(systemIndex, system)
      }
      let measure = measures.get(key)
      if (!measure) {
        const sameMeasureBefore = seenMeasures.has(measureId)
        seenMeasures.add(measureId)
        measure = { tagName: 'g', attributes: { class: 'measure', id: sameMeasureBefore ? `${measureId}-s${systemIndex}` : measureId, 'data-m3n-measure-id': measureId }, children: [] }
        system.children.push(measure); measures.set(key, measure)
      }
      const object = objectLocations.get(Number(child.attributes['data-jpfun-object']))
      if (object) {
        if (isOpeningRepeat(object.node)) openingRepeatMeasures.add(measure)
        const left = object.node.box.x, right = left + object.node.box.w
        measure.attributes['data-m3n-measure-start'] = String(Math.min(Number(measure.attributes['data-m3n-measure-start'] ?? Infinity), left))
        measure.attributes['data-m3n-measure-end'] = String(Math.max(Number(measure.attributes['data-m3n-measure-end'] ?? -Infinity), right))
      }
      measure.children.push(child)
    }
    // Justification leaves elastic space between a closing bar and the next
    // note. It belongs to the following measure's interaction area, so anchor
    // that area to the preceding bar rather than the first note's glyph box.
    // Reset at every system: a wrapped measure must keep its local bounds.
    for (const system of systems.values()) {
      const rowMeasures = system.children.filter((child): child is TNode => typeof child !== 'string').sort((a, b) =>
        Number(a.attributes['data-m3n-measure-start']) - Number(b.attributes['data-m3n-measure-start']))
      for (let index = 1; index < rowMeasures.length; index++) {
        const previousEnd = Number(rowMeasures[index - 1]!.attributes['data-m3n-measure-end'])
        const measure = rowMeasures[index]!
        // A shared opening repeat belongs to this measure. The preceding
        // measure ends at its last note box, not at a separately owned bar.
        // Keep the repeat's own left edge instead of reaching back to that note.
        if (openingRepeatMeasures.has(measure)) continue
        const start = Number(measure.attributes['data-m3n-measure-start'])
        if (Number.isFinite(previousEnd) && Number.isFinite(start)) {
          measure.attributes['data-m3n-measure-start'] = String(Math.min(start, previousEnd))
        }
      }
    }
    const defs: TNode = { tagName: 'defs', attributes: {}, children: [{ tagName: 'style', attributes: {}, children: [NUMBER_FONT_CSS] }] }
    // Relationships retain their original global coordinates and paint over the music layer.
    const background = remaining.filter(child => typeof child !== 'string' && child.tagName === 'rect')
    const foreground = remaining.filter(child => !background.includes(child as TNode))
    root.children = [defs, ...background, ...systems.values(), ...foreground]
    return stringify([root])
  })
}
