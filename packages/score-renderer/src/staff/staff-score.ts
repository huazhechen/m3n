import { SCORE_TEXT_FONT, scoreLayoutConfig, scoreLineQuality, scoreHorizontalQuality, scoreCoreGap, scoreMaximumCoreGap } from '@m3n/numbered-notation'
import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import { findAll, hasClass, element, translate, moveInk, xml, SvgGeometry, type XmlNode } from './layout-svg.js'
import { planStaffLines, STAFF_SCALE, type StaffLine } from './line-layout.js'
import { paginateStaff, type StaffSystem, type StaffPage } from './system-layout.js'
import { staffHeader } from './staff-header.js'
import { a4SourcePageHeight } from '../score-export.js'
import { needsStaffExpansion } from './display-score.js'
import { resolveStaffText } from './svg-text.js'
import { prepareStaffMeasurementTask, type StaffMeasurementTask } from './staff-measurement-task.js'
export { prepareStaffMeasurementTask, type StaffMeasurementTask } from './staff-measurement-task.js'
import { engraveStaffSystems } from './staff-system.js'

const ns = 'http://www.w3.org/2000/svg'
export type StaffSettings = {
  width?: number; transpose?: number; tempoScale?: number; measureNumbers?: boolean
  includeBass?: boolean; pageMargin?: number; coreGap?: number
}
/** Fonts are prepared per score; there is no separate engine resource. */
export async function prepareStaffResources() {}

export async function prepareStaffScore(score: ScoreDocument, settings: StaffSettings, signal?: AbortSignal, task?: StaffMeasurementTask) {
  const measurements = task ?? await prepareStaffMeasurementTask(score, settings, signal)
  measurements.assertCompatible(score, settings)
  signal?.throwIfAborted()
  const width = settings.width ?? DEFAULT_PREFERRED_WIDTH
  const minimumGap = scoreCoreGap(score)
  const outputGap = settings.coreGap ?? minimumGap
  const margin = settings.pageMargin ?? 0
  const validate = (w: number) => {
    if (!Number.isFinite(w) || w < scoreLayoutConfig.staff.minimumWidth || !Number.isFinite(minimumGap) || minimumGap < 0 || !Number.isFinite(outputGap) || outputGap < 0 || !Number.isFinite(margin) || margin < 0 || margin * 2 + scoreLayoutConfig.staff.minimumContentWidth > w)
      throw new Error('五线谱版宽、页边距或行距无效。')
  }
  validate(width)
  const projected = measurements.document
  const displayedEvents = new Set(projected.measures.flatMap(measure => [measure.melody, measure.bass]
    .flatMap(lane => lane.flatMap(event => event.children ?? [event])).map(event => event.id))).size
  const tempoScale = settings.tempoScale ?? 1
  const measure = measurements.measure
  type Layout = {
    systems: StaffSystem[]; pages: StaffPage[]; furniture: XmlNode[]
    header: ReturnType<typeof staffHeader>; lines: StaffLine[]; spacing: number; paginationError?: Error
    quality: ReturnType<typeof scoreLineQuality>
  }
  const layouts = new Map<number, Layout>()
  const cache = new Map<boolean, string[]>()
  const layout = (candidateWidth: number): Layout => {
    validate(candidateWidth)
    const saved = layouts.get(candidateWidth)
    if (saved) return saved
    signal?.throwIfAborted()
    const innerWidth = candidateWidth - 2 * margin
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const musicWidth = innerWidth - gutter - scoreLayoutConfig.staff.rightGutter
    const header = staffHeader(score, innerWidth, measure, settings.transpose)
    const height = a4SourcePageHeight(candidateWidth) - 2 * margin
    const attempt = (spacing: number): Layout => {
      signal?.throwIfAborted()
      const lines = planStaffLines(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum)
      const systems = engraveStaffSystems(projected, lines, musicWidth, measure, spacing, Boolean(settings.measureNumbers), tempoScale, measurements.preparation)
      for (const system of systems) {
        translate(system.node, gutter / STAFF_SCALE, 0)
        system.pieces = system.pieces.map(piece => moveInk(piece, gutter, 0))
        system.spacingPieces = system.spacingPieces.map(piece => moveInk(piece, gutter, 0))
        system.edgePieces = system.edgePieces.map(piece => ({ ...moveInk(piece, gutter, 0), gap: piece.gap }))
        system.ink = moveInk(system.ink, gutter, 0)
        system.core = moveInk(system.core, gutter, 0)
      }
      let pages: StaffPage[] = [], paginationError: Error | undefined
      try { pages = paginateStaff(systems, height, header.height, minimumGap, true) }
      catch (error) {
        if (!(error instanceof Error) || !error.message.includes('单个五线谱谱行')) throw error
        paginationError = error
      }
      const available = musicWidth - scoreLayoutConfig.staff.contentEdgeInset
      const quality = scoreLineQuality(lines.map(line => (line.reading ?? line.minimum) * STAFF_SCALE / available),
        lines.length ? Math.max(0, Math.min(1, 1 - lines.at(-1)!.target * STAFF_SCALE / available)) : 0)
      return { systems, pages, furniture: [], header, lines, spacing, paginationError, quality }
    }
    let selected = attempt(0.25)
    if (!selected.paginationError) for (const spacing of scoreLayoutConfig.numbered.noteGapCandidates.slice(1).reverse().map(gap => .25 + (gap - scoreLayoutConfig.numbered.minimumNoteGap) / 48)) {
      const candidate = attempt(spacing)
      if (candidate.paginationError) continue
      const candidateScore = scoreHorizontalQuality(candidateWidth, candidate.quality)
      const selectedScore = scoreHorizontalQuality(candidateWidth, selected.quality)
      if (candidate.lines.length < selected.lines.length || candidate.lines.length === selected.lines.length
        && (candidateScore > selectedScore || candidateScore === selectedScore && candidate.spacing < selected.spacing)) selected = candidate
    }
    layouts.set(candidateWidth, selected)
    return selected
  }
  const outputPages = (result: Layout, paged: boolean, candidateWidth = width) => {
    if (paged && settings.coreGap === undefined) {
      if (result.paginationError) throw result.paginationError
      return result.pages
    }
    return paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header.height, outputGap, paged, settings.coreGap === undefined ? scoreMaximumCoreGap(outputGap) : outputGap)
  }
  const engrave = (paged: boolean) => {
    if (cache.has(paged)) return
    const result = layout(width)
    const pages = outputPages(result, paged)
    // Publish local painted bounds for interaction; SVG font line boxes can
    // extend far beyond the actual music glyphs.
    for (const system of result.systems) {
      const geometry = new SvgGeometry(system.node, measure, true)
      const systemBox = geometry.ink(element('g', {}, system.node.children))
      system.node.attributes['data-m3n-ink-bounds'] = [systemBox.left, systemBox.top, systemBox.right - systemBox.left, systemBox.bottom - systemBox.top].join(' ')
      for (const group of findAll(system.node, n => hasClass(n, 'measure'))) {
        const box = geometry.ink(element('g', {}, group.children))
        group.attributes['data-m3n-ink-bounds'] = [box.left, box.top, box.right - box.left, box.bottom - box.top].join(' ')
      }
    }
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
              'font-family': SCORE_TEXT_FONT,
              'font-weight': String(scoreLayoutConfig.fonts.textWeight),
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
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      resolveStaffText(svg, settings.measureNumbers)
      svg.querySelectorAll('defs').forEach((node) => node.remove())
      svg.dataset.notation = 'staff'
      for (const event of svg.querySelectorAll<SVGGElement>('g.note[id], g.chord[id], g.tuplet[id], g.rest[id]')) {
        if (!/^m3n-e-\d+(?:-rend\d+)?(?:-n\d+)?$/.test(event.id)) continue
        const slot = /-n(\d+)$/.exec(event.id)?.[1]
        if (slot) event.dataset.m3nTupletSlot = String(Number(slot) - 1)
        event.dataset.m3nId = event.id.replace(/-n\d+$/, '').replace(/-rend\d+$/, '')
        if (needsStaffExpansion(score)) event.dataset.m3nPasses = /-rend(\d+)/.exec(event.id)?.[1] ?? '1'
      }

      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String((width * svg.viewBox.baseVal.height) / svg.viewBox.baseVal.width))
      return svg
    })
  }
  return Object.assign(render, {
    /** Continuous geometry without generating or mounting an SVG candidate. */
    continuousHeight() {
      return outputPages(layout(width), false)[0]!.height + 2 * margin
    },
    /** Detached metadata for geometry audits and width selection. */
    layoutInfo(candidateWidth = width) {
      const result = layout(candidateWidth)
      return {
        displayedEvents,
        hasBass: projected.hasBass,
        spacing: result.spacing,
        quality: { ...result.quality },
        headerHeight: result.header.height,
        availableWidth: candidateWidth - 2 * margin - (projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter) - scoreLayoutConfig.staff.rightGutter - scoreLayoutConfig.staff.contentEdgeInset,
        pageCount: result.paginationError ? 0 : outputPages(result, true, candidateWidth).length,
        lines: result.lines.map((line, index) => ({
          core: { ...result.systems[index]!.core },
          inkHeight: result.systems[index]!.ink.bottom - result.systems[index]!.ink.top,
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
