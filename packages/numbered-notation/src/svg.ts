import { ASTFunctionNode, ANCHOR_KEY, renderLayoutPagesToSvg, type ASTNodeBase, type CompileScoreResult, type VisualTemporalNode } from '@m3n/jpfun'
import { parse, stringify, type TNode } from 'txml/txml'
import { NUMBER_FONT_CSS } from './font-data.js'
import type { EventBinding, ProjectedScore } from './projection.js'

type Located = { binding: EventBinding; line: number; node: VisualTemporalNode }
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
      const value = located.get(node)
      if (value) {
        objectLocations.set(node.order, value)
        return {
          class: 'note', id: value.binding.visualId, 'data-m3n-id': value.binding.xmlId,
          'data-jpfun-object': String(node.order), 'data-m3n-system': String(value.line), 'data-m3n-measure': value.binding.measureId,
        }
      }
      const candidates = objectsByTrack.get(node.track) ?? []
      const openingRepeat = node.ast instanceof ASTFunctionNode && node.ast.callName === 'bar' && (node.ast as ASTFunctionNode & { type?: number }).type === 3
      const previous = candidates.filter(value => node.mergeKey === ANCHOR_KEY && !openingRepeat ? value.node.t.compare(node.t) < 0 : value.node.t.compare(node.t) <= 0).at(-1)
      const next = candidates.find(value => value.node.t.compare(node.t) >= 0 && value.node.ast.sourceSpan.start < node.ast.sourceSpan.end)
      const related = previous ?? next
      if (!related || node.ast.sourceSpan.start < Math.min(...candidates.map(value => value.node.ast.sourceSpan.start))) return undefined
      const current = { ...related, node, line: node.layoutLine }
      objectLocations.set(node.order, current)
      return { 'data-jpfun-object': String(node.order), 'data-m3n-system': String(node.layoutLine), 'data-m3n-measure': related.binding.measureId }
    },
    textAttributes(style) {
      const semantic = style.semantic
      if (!semantic) return undefined
      const target = sourceTargets.get(spanKey(semantic.sourceSpan))
      if (!target) return undefined
      if (semantic.role === 'annotation') return {
        'data-m3n-id': target.binding.xmlId, 'data-m3n-role': semantic.role,
        'data-m3n-system': String(target.line), 'data-m3n-measure': target.binding.measureId,
      }
      const row = projection.rows[semantic.row] ?? semantic.row
      const data = target.binding.lyrics.get(row)
      return {
        'data-m3n-id': target.binding.xmlId, 'data-m3n-role': semantic.role, 'data-m3n-rendition': String(row + 1),
        'data-m3n-passes': data?.passes ? [...data.passes].join('-') : String(row + 1),
        'data-m3n-system': String(target.line), 'data-m3n-measure': target.binding.measureId,
        ...(semantic.underlined ? { 'data-m3n-underlined': 'true' } : {}),
      }
    },
  })
  const seenMeasures = new Set<string>()
  return native.map((svg, pageIndex) => {
    const root = parse(svg).find((item): item is TNode => typeof item !== 'string' && item.tagName === 'svg')!
    root.attributes['data-engine'] = 'jpfun'
    const systems = new Map<string, TNode>()
    const measures = new Map<string, TNode>()
    const remaining: Array<TNode | string> = []
    for (const child of root.children) {
      if (typeof child === 'string') { remaining.push(child); continue }
      const systemIndex = child.attributes['data-m3n-system']
      const measureId = child.attributes['data-m3n-measure']
      if (systemIndex === undefined || systemIndex === null || !measureId) { remaining.push(child); continue }
      const key = `${systemIndex}:${measureId}`
      let system = systems.get(systemIndex)
      if (!system) {
        system = { tagName: 'g', attributes: { class: 'system', id: `m3n-system-${pageIndex + 1}-${systemIndex}` }, children: [] }
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
        const left = object.node.box.x, right = left + object.node.box.w
        measure.attributes['data-m3n-measure-start'] = String(Math.min(Number(measure.attributes['data-m3n-measure-start'] ?? Infinity), left))
        measure.attributes['data-m3n-measure-end'] = String(Math.max(Number(measure.attributes['data-m3n-measure-end'] ?? -Infinity), right))
      }
      measure.children.push(child)
    }
    const defs: TNode = { tagName: 'defs', attributes: {}, children: [{ tagName: 'style', attributes: {}, children: [NUMBER_FONT_CSS] }] }
    // Relationships retain their original global coordinates and paint over the music layer.
    const background = remaining.filter(child => typeof child !== 'string' && child.tagName === 'rect')
    const foreground = remaining.filter(child => !background.includes(child as TNode))
    root.children = [defs, ...background, ...systems.values(), ...foreground]
    return stringify([root])
  })
}
