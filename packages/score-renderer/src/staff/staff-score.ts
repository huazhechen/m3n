import createVerovioModule from '../../vendor/verovio/verovio-module.mjs'
import { VerovioToolkit } from 'verovio/esm'
import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import {
  readXml,
  xml,
  nodes,
  findAll,
  hasClass,
  element,
  translate,
  moveInk,
  textContent,
  textMeasurer,
  SvgGeometry,
  type XmlNode,
} from './layout-svg.js'
import { planStaffLines, staffWidths, STAFF_SCALE, type StaffLine } from './line-layout.js'
import { arrangeStaffSystem, paginateStaff, type StaffSystem, type StaffPage } from './system-layout.js'
import { staffHeader } from './staff-header.js'
import { a4SourcePageHeight } from '../score-export.js'
import { needsStaffExpansion } from './display-score.js'
import { resolveStaffText } from './svg-text.js'
import { scoreToMei } from './score-mei.js'

let engine: ReturnType<typeof createVerovioModule> | undefined
const ns = 'http://www.w3.org/2000/svg'
export type StaffSettings = {
  width?: number
  transpose?: number
  tempoScale?: number
  measureNumbers?: boolean
  includeBass?: boolean
  pageMargin?: number
  coreGap?: number
}

/** Initialize the shared optional engine without preparing an individual score. */
export function prepareStaffResources() {
  engine ??= createVerovioModule().catch((error) => {
    engine = undefined
    throw error
  })
  return engine
}

/** Staff engraving is optional. Playback and numbered engraving never load this module. */
export async function prepareStaffScore(score: ScoreDocument, settings: StaffSettings, signal?: AbortSignal) {
  const module = await prepareStaffResources()
  signal?.throwIfAborted()
  const width = settings.width ?? score.staffPreferredWidth ?? DEFAULT_PREFERRED_WIDTH
  const tempoScale = settings.tempoScale ?? 1
  const displayScore = {
    ...score,
    tempo: score.tempo * tempoScale,
    parts: new Map(
      [...score.parts].map(([name, part]) => {
        const copy = (measures: typeof part.melody) =>
          measures.map((measure) => ({
            ...measure,
            multiRestState: measure.multiRestState
              ? { ...measure.multiRestState, tempo: measure.multiRestState.tempo * tempoScale }
              : undefined,
            events: measure.events.map((event) => ({
              ...event,
              tempo: event.tempo === undefined ? undefined : event.tempo * tempoScale,
            })),
          }))
        return [name, { melody: copy(part.melody), bass: settings.includeBass === false ? [] : copy(part.bass) }]
      }),
    ),
  }
  const measure = textMeasurer()
  const meiRoot = readXml(scoreToMei(displayScore))
  for (const syl of findAll(meiRoot, (n) => n.tagName === 'syl')) {
    const text = textContent(syl).replace(/[\u200B\u2800]/g, '')
    if (!text.trim()) continue
    const metrics = measure(text, 16)
    const inkWidth = Math.max(metrics.width, metrics.right) - Math.min(0, metrics.left)
    syl.attributes.type = `m3n-ink-${((inkWidth + 4) / STAFF_SCALE).toFixed(3)} ${syl.attributes.type ?? ''}`.trim()
  }
  const emptyVerses = new Map<string, XmlNode[]>()
  for (const parent of findAll(meiRoot, (n) => ['note', 'chord'].includes(n.tagName))) {
    const empty = nodes(parent).filter((n) => n.tagName === 'verse' && !textContent(n).replace(/[\s\u200B\u2800]/g, ''))
    if (empty.length) {
      emptyVerses.set(parent.attributes['xml:id']!, empty)
      parent.children = parent.children.filter((child) => typeof child === 'string' || !empty.includes(child))
    }
  }
  const mei = xml(meiRoot)
  const minimumGap = (score.minimumCoreGapEm ?? 1.2) * 22
  const outputGap = settings.coreGap ?? minimumGap
  const margin = settings.pageMargin ?? 0
  if (
    !Number.isFinite(width) ||
    width < 320 ||
    !Number.isFinite(minimumGap) ||
    minimumGap < 0 ||
    !Number.isFinite(outputGap) ||
    outputGap < 0 ||
    !Number.isFinite(margin) ||
    margin < 0 ||
    margin * 2 + 80 > width
  )
    throw new Error('五线谱版宽、页边距或行距无效。')
  type Layout = {
    systems: StaffSystem[]
    pages: StaffPage[]
    furniture: XmlNode[]
    header: ReturnType<typeof staffHeader>
    lines: StaffLine[]
    spacing: number
    paginationError?: Error
  }
  const layouts = new Map<number, Layout>()
  const cache = new Map<boolean, string[]>()
  const layout = (candidateWidth: number): Layout => {
    const saved = layouts.get(candidateWidth)
    if (saved) return saved
    signal?.throwIfAborted()
    const innerWidth = candidateWidth - 2 * margin
    // The grand-staff brace protrudes to the left of Verovio's staff origin.
    const musicInset = [...displayScore.parts.values()].some((part) =>
      part.bass.some((measure) => measure.events.length || measure.multiRest)) ? 12 : 0
    const musicWidth = innerWidth - musicInset
    const header = staffHeader(score, innerWidth, measure, settings.transpose)
    const height = a4SourcePageHeight(candidateWidth) - 2 * margin
    const toolkit = new VerovioToolkit(module)
    try {
      const base = {
        font: 'Leipzig',
        fontFallback: 'Leipzig',
        header: 'none',
        footer: 'none',
        svgViewBox: true,
        scale: 38,
        pageWidth: Math.round((musicWidth * 100) / 38),
        pageHeight: 60000,
        pageMarginTop: 0,
        pageMarginBottom: 0,
        pageMarginLeft: 0,
        pageMarginRight: 0,
        adjustPageHeight: true,
        adjustPageWidth: false,
        breaks: 'line',
        breaksSmartSb: 0,
        noJustification: false,
        minLastJustification: 0,
        spacingSystem: 3,
        spacingNonLinear: 0.5,
        lyricSize: 16 / (STAFF_SCALE * 90),
        mnumInterval: settings.measureNumbers ? 1 : 0,
        transpose: String(settings.transpose ?? 0),
      }
      const engrave = (source: string, options: Record<string, unknown> = {}) => {
        signal?.throwIfAborted()
        toolkit.setOptions({ ...base, ...options })
        if (!toolkit.loadData(source)) throw new Error(toolkit.getLog() || '五线谱排版失败。')
        return Array.from({ length: toolkit.getPageCount() }, (_, i) => toolkit.renderToSVG(i + 1))
      }
      const attempt = (spacing: number): Layout => {
        const render = (source: string, options: Record<string, unknown> = {}) =>
          engrave(source, { spacingLinear: spacing, ...options })
        const adjustments = new Map<string, number>()
        let planned: ReturnType<typeof planStaffLines> | undefined
        let sources: string[] = []
        for (let pass = 0; pass < 12; pass++) {
          planned = planStaffLines(mei, musicWidth, Boolean(score.equalMeasures), render, measure, adjustments)
          sources = render(planned.mei)
          const actual = staffWidths(sources)
          let retry = false
          for (const [id, target] of planned.targets) {
            const excess = (actual.get(id) ?? target) - target
            if (excess > 8) {
              adjustments.set(id, (adjustments.get(id) ?? 0) + excess + 8)
              retry = true
            }
          }
          if (!retry) break
          if (pass === 11) throw new Error('五线谱行首与跨行关系的最小占宽无法稳定。')
        }
        if (!planned) throw new Error('五线谱分行失败。')
        const sectionHeadings = new Set(
          findAll(
            readXml(planned.mei),
            (n) => n.tagName === 'measure' && findAll(n, (c) => c.attributes.type === 'm3n-section-heading').length > 0,
          ).map((n) => n.attributes['xml:id']!),
        )
        let roots: XmlNode[] = []
        let systems: StaffSystem[] = []
        let staffSpacing = 12
        for (let pass = 0; pass < 6; pass++) {
          roots = sources.map(readXml)
          for (const root of roots)
            for (const event of findAll(root, (n) => emptyVerses.has(n.attributes.id ?? ''))) {
              for (const verse of emptyVerses.get(event.attributes.id!)!)
                event.children.push(element('g', {
                  id: verse.attributes['xml:id']!,
                  class: `verse ${verse.attributes.type ?? ''}`.trim(),
                  'data-m3n-empty-verse': 'true',
                }))
            }
          const systemNodes = roots.flatMap((root) => findAll(root, (n) => hasClass(n, 'system')))
          systemNodes.forEach((system, index) => {
            for (const ending of findAll(system, (n) => hasClass(n, 'ending') && Boolean(n.attributes.class?.split(/\s+/).includes('spanning')))) {
              const endingId = (ending.attributes.class ?? '').split(/\s+/).find((name) => name.startsWith('id-'))
              if (!endingId) continue
              const previousFragment = systemNodes.slice(0, index).some((previous) =>
                findAll(previous, (n) => hasClass(n, 'ending') && (n.attributes.class ?? '').split(/\s+/).includes(endingId)).length > 0,
              )
              if (previousFragment) continue
              const bracket = findAll(ending, (n) => hasClass(n, 'voltaBracket'))[0]
              if (!bracket) continue
              const paths = findAll(bracket, (n) => n.tagName === 'path')
              const horizontal = paths.find((path) => {
                const numbers = path.attributes.d?.match(/[-+]?\d*\.?\d+/g)?.map(Number) ?? []
                return numbers.length >= 4 && Math.abs(numbers[1]! - numbers[3]!) < 0.01
              })
              const d = horizontal?.attributes.d?.match(/[-+]?\d*\.?\d+/g)?.map(Number)
              const rightHook = paths.find((path) => {
                const numbers = path.attributes.d?.match(/[-+]?\d*\.?\d+/g)?.map(Number) ?? []
                return Boolean(d) && numbers.length >= 4 && Math.abs(numbers[0]! - numbers[2]!) < 0.01
                  && Math.abs(numbers[0]! - d![2]!) < 0.01
              })
              const hook = rightHook?.attributes.d?.match(/[-+]?\d*\.?\d+/g)?.map(Number)
              if (d && hook) bracket.children.push(element('path', {
                d: `M${d[0]} ${d[1]} L${d[0]} ${hook[3]}`,
                stroke: horizontal?.attributes.stroke ?? '#000',
                'stroke-width': horizontal?.attributes['stroke-width'] ?? '13',
                'stroke-linecap': horizontal?.attributes['stroke-linecap'] ?? 'square',
                fill: 'none',
                class: 'm3n-ending-start-hook',
              }))
              ending.attributes.class = (ending.attributes.class ?? '').split(/\s+/).filter((name) => name !== 'spanning').join(' ')
              for (const text of findAll(bracket, (n) => n.tagName === 'text'))
                text.children = text.children.map((child) => typeof child === 'string' ? child.replace(/\((\d+(?:\.\d+)*)\)/g, '$1') : child)
            }
          })
          systems = systemNodes.map((node) => {
            const root = roots.find((candidate) => findAll(candidate, (n) => n === node).length > 0)!
            const geometry = new SvgGeometry(root, measure)
            return arrangeStaffSystem(node, geometry, musicWidth, sectionHeadings)
          })
          const required = Math.max(0, ...systems.map((system) => system.staffSpacing))
          if (!required) break
          if (pass === 5) throw new Error('五线谱歌词与低音谱表的净空无法稳定。')
          staffSpacing = Math.ceil(Math.max(staffSpacing + 4, required))
          const spaced = readXml(planned.mei)
          for (const staff of findAll(spaced, (n) => n.tagName === 'staffDef' && n.attributes.n === '2'))
            staff.attributes.spacing = `${staffSpacing}vu`
          sources = render(xml(spaced))
        }
        if (musicInset)
          for (const system of systems) {
            translate(system.node, musicInset / STAFF_SCALE, 0)
            system.pieces = system.pieces.map((piece) => moveInk(piece, musicInset, 0))
            system.spacingPieces = system.spacingPieces.map((piece) => moveInk(piece, musicInset, 0))
            system.ink = moveInk(system.ink, musicInset, 0)
            system.core = moveInk(system.core, musicInset, 0)
          }
        let pages: StaffPage[] = []
        let paginationError: Error | undefined
        try {
          pages = paginateStaff(systems, height, header.height, minimumGap, true)
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('单个五线谱谱行')) throw error
          paginationError = error
        }
        const furniture = roots.flatMap((root) => nodes(root).filter((n) => ['defs', 'style'].includes(n.tagName)))
        for (const style of furniture.filter((n) => n.tagName === 'style'))
          style.children = style.children.map((child) =>
            typeof child === 'string' ? child.replace(/#[\w-]+(?= )/g, 'svg[data-notation="staff"]') : child,
          )
        return { systems, pages, furniture, header, lines: planned.lines, spacing, paginationError }
      }
      let selected = attempt(0.25)
      for (const spacing of [0.375, 0.34375, 0.3125, 0.28125]) {
        if (selected.paginationError) break
        const candidate = attempt(spacing)
        if (!candidate.paginationError && candidate.pages.length <= selected.pages.length) {
          selected = candidate
          break
        }
      }
      layouts.set(candidateWidth, selected)
      return selected
    } finally {
      toolkit.destroy()
    }
  }
  const outputPages = (result: Layout, paged: boolean, candidateWidth = width) => {
    if (paged && outputGap === minimumGap) {
      if (result.paginationError) throw result.paginationError
      return result.pages
    }
    return paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header.height, outputGap, paged)
  }
  const engrave = (paged: boolean) => {
    if (cache.has(paged)) return
    const result = layout(width)
    const pages = outputPages(result, paged)
    cache.set(
      paged,
      pages.map((page, index) => {
        const content: XmlNode[] = [...result.furniture]
        if (index === 0)
          content.push(element('g', { transform: `translate(${margin} ${margin})` }, [result.header.node]))
        page.systems.forEach((system, i) =>
          content.push(
            element('g', { transform: `translate(${margin} ${margin + page.ys[i]!}) scale(${STAFF_SCALE})` }, [
              system.node,
            ]),
          ),
        )
        return xml(
          element(
            'svg',
            {
              xmlns: ns,
              'xmlns:xlink': 'http://www.w3.org/1999/xlink',
              viewBox: `0 0 ${width} ${page.height + 2 * margin}`,
              width: String(width),
              height: String(page.height + 2 * margin),
              'font-family': 'serif',
              color: '#000',
              'data-notation': 'staff',
              'data-m3n-note-spacing': String(result.spacing),
              'data-m3n-core-gap': String(page.gap),
            },
            content,
          ),
        )
      }),
    )
  }
  const render = (paged: boolean): SVGSVGElement[] => {
    engrave(paged)
    const markup = cache.get(paged)!
    return markup.map((text) => {
      const host = document.createElement('div')
      host.innerHTML = text
      const svg = host.querySelector('svg')!
      // Resolve glyph references inside each page. Both PNG and the existing vector PDF
      // writer then consume ordinary paths without another graphics dependency.
      for (const use of svg.querySelectorAll('use')) {
        const id = use.getAttribute('href') ?? use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        const glyph = id?.startsWith('#') ? svg.querySelector(`[id="${id.slice(1)}"]`) : null
        if (!glyph) throw new Error('五线谱字形缺失。')
        const group = document.createElementNS(ns, 'g')
        for (const attr of use.attributes)
          if (!['href', 'xlink:href', 'x', 'y', 'transform'].includes(attr.name))
            group.setAttribute(attr.name, attr.value)
        group.setAttribute(
          'transform',
          `translate(${use.getAttribute('x') ?? 0} ${use.getAttribute('y') ?? 0}) ${use.getAttribute('transform') ?? ''}`,
        )
        const copy = glyph.cloneNode(true) as Element
        copy.removeAttribute('id')
        group.append(copy)
        use.replaceWith(group)
      }
      // Keep the optional renderer within the existing PDF primitive contract.
      for (const shape of svg.querySelectorAll('polygon, polyline, ellipse')) {
        const replacement = document.createElementNS(ns, shape.localName === 'ellipse' ? 'circle' : 'path')
        for (const attr of shape.attributes)
          if (!['points', 'cx', 'cy', 'rx', 'ry', 'transform'].includes(attr.name))
            replacement.setAttribute(attr.name, attr.value)
        const transform = shape.getAttribute('transform') ?? ''
        if (shape.localName === 'ellipse') {
          replacement.setAttribute('r', '1')
          replacement.setAttribute(
            'transform',
            `${transform} translate(${shape.getAttribute('cx') ?? 0} ${shape.getAttribute('cy') ?? 0}) scale(${shape.getAttribute('rx') ?? 0} ${shape.getAttribute('ry') ?? 0})`,
          )
        } else {
          const points = (shape.getAttribute('points') ?? '')
            .trim()
            .split(/[\s,]+/)
            .map(Number)
          replacement.setAttribute(
            'd',
            points.reduce(
              (path, value, index) => path + (index % 2 ? ` ${value}` : `${index ? ' L' : 'M'}${value}`),
              '',
            ) + (shape.localName === 'polygon' ? ' Z' : ''),
          )
          if (transform) replacement.setAttribute('transform', transform)
        }
        shape.replaceWith(replacement)
      }
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      resolveStaffText(svg, settings.measureNumbers)
      svg.querySelectorAll('defs').forEach((node) => node.remove())
      svg.dataset.notation = 'staff'
      if (needsStaffExpansion(score))
        for (const event of svg.querySelectorAll<SVGGElement>('g.note[id], g.chord[id], g.tuplet[id], g.rest[id]')) {
          if (!/^m3n-e-\d+(?:-rend\d+)?$/.test(event.id)) continue
          event.dataset.m3nId = event.id.replace(/-rend\d+$/, '')
          event.dataset.m3nPasses = /-rend(\d+)$/.exec(event.id)?.[1] ?? '1'
        }

      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String((width * svg.viewBox.baseVal.height) / svg.viewBox.baseVal.width))
      return svg
    })
  }
  return Object.assign(render, {
    /** Detached metadata for geometry audits and width selection. */
    layoutInfo(candidateWidth = width) {
      const result = layout(candidateWidth)
      return {
        spacing: result.spacing,
        headerHeight: result.header.height,
        lines: result.lines.map((line) => ({
          minimum: line.minimum * STAFF_SCALE,
          target: line.target * STAFF_SCALE,
          measures: line.measures.map((m) => m.id),
        })),
        pages: (result.paginationError ? [] : outputPages(result, true, candidateWidth)).map((page) => ({
          gap: page.gap,
          height: page.height,
          systems: page.systems.map((system, i) => ({
            ink: { ...system.ink },
            y: page.ys[i]!,
            measures: findAll(system.node, (n) => hasClass(n, 'measure')).map((n) => n.attributes.id!),
          })),
        })),
      }
    },
    pageCount(paged: boolean, candidateWidth = width) {
      if (!paged) return 1
      const result = layout(candidateWidth)
      return outputPages(result, true, candidateWidth).length
    },
  })
}
