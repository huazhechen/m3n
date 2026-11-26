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
  /** Detached exports have no pointer/reading hit targets. */
  interactive?: boolean
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
  const expanded = needsStaffExpansion(score)
  const displayedEvents = new Set(projected.measures.flatMap(measure => [measure.melody, measure.bass]
    .flatMap(lane => lane.flatMap(event => event.children ?? [event])).map(event => event.id))).size
  const tempoScale = settings.tempoScale ?? 1
  const measure = measurements.measure
  const horizontal = new Map<number, Array<{ spacing: number; lines: StaffLine[]; quality: ReturnType<typeof scoreLineQuality> }>>()
  const plans = (candidateWidth: number) => {
    validate(candidateWidth)
    let saved = horizontal.get(candidateWidth)
    if (saved) return saved
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const musicWidth = candidateWidth - 2 * margin - gutter - scoreLayoutConfig.staff.rightGutter
    const available = musicWidth - scoreLayoutConfig.staff.contentEdgeInset
    saved = [0.25, ...scoreLayoutConfig.numbered.noteGapCandidates.slice(1).reverse().map(gap => .25 + (gap - scoreLayoutConfig.numbered.minimumNoteGap) / 48)].map(spacing => {
      signal?.throwIfAborted()
      const lines = planStaffLines(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum)
      const quality = scoreLineQuality(lines.map(line => (line.reading ?? line.minimum) * STAFF_SCALE / available),
        lines.length ? Math.max(0, Math.min(1, 1 - lines.at(-1)!.target * STAFF_SCALE / available)) : 0)
      return { spacing, lines, quality }
    })
    horizontal.set(candidateWidth, saved)
    return saved
  }
  type Layout = {
    systems: StaffSystem[]; pages: StaffPage[]; fittedPages?: StaffPage[]; furniture: XmlNode[]
    header: ReturnType<typeof staffHeader>; lines: StaffLine[]; spacing: number; paginationError?: Error
    quality: ReturnType<typeof scoreLineQuality>
  }
  const layouts = new Map<number, Layout>()
  const cache = new Map<boolean, { coreGap?: number; markup: string[] }>()
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
    const attempt = (spacing: number, selected?: Layout): Layout => {
      signal?.throwIfAborted()
      const { lines, quality } = plans(candidateWidth).find(plan => plan.spacing === spacing)!
      // Vertical engraving cannot improve this horizontal ranking. Complete
      // the baseline and every possible replacement, but discard losing gaps
      // before constructing their glyph nodes and collision geometry.
      if (selected) {
        const candidateScore = scoreHorizontalQuality(candidateWidth, quality)
        const selectedScore = scoreHorizontalQuality(candidateWidth, selected.quality)
        const wins = lines.length < selected.lines.length || lines.length === selected.lines.length
          && (candidateScore > selectedScore || candidateScore === selectedScore && spacing < selected.spacing)
        if (!wins) return selected
      }
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
      try { pages = paginateStaff(systems, height, header.height, minimumGap, true, minimumGap) }
      catch (error) {
        if (!(error instanceof Error) || !error.message.includes('单个五线谱谱行')) throw error
        paginationError = error
      }
      return { systems, pages, furniture: [], header, lines, spacing, paginationError, quality }
    }
    let selected = attempt(0.25)
    // The trial ranking is known before engraving. Visit alternatives in that
    // exact total order: the first valid improvement is the final winner, so
    // intermediate winners need no vertical geometry. The baseline must still
    // paginate, and invalid alternatives fall through to the next original trial.
    if (!selected.paginationError) {
      const ranked = plans(candidateWidth).filter(plan => plan.spacing !== .25).slice().sort((a, b) =>
        a.lines.length - b.lines.length
        || scoreHorizontalQuality(candidateWidth, b.quality) - scoreHorizontalQuality(candidateWidth, a.quality)
        || a.spacing - b.spacing)
      for (const plan of ranked) {
        const candidate = attempt(plan.spacing, selected)
        if (candidate === selected) break
        if (candidate.paginationError) continue
        selected = candidate
        break
      }
    }
    layouts.set(candidateWidth, selected)
    return selected
  }
  const outputPages = (result: Layout, paged: boolean, candidateWidth = width, coreGap = settings.coreGap) => {
    const gap = coreGap ?? minimumGap
    if (!Number.isFinite(gap) || gap < 0) throw new Error('五线谱行距无效。')
    if (paged && coreGap === undefined) {
      if (result.paginationError) throw result.paginationError
      return result.fittedPages ??= paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header.height, gap, true)
    }
    return paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header.height, gap, paged, coreGap === undefined ? scoreMaximumCoreGap(gap) : gap)
  }
  const engrave = (paged: boolean, coreGap = settings.coreGap) => {
    const saved = cache.get(paged)
    if (saved && saved.coreGap === coreGap) return
    const result = layout(width)
    const pages = outputPages(result, paged, width, coreGap)
    // Publish local painted bounds for interaction; SVG font line boxes can
    // extend far beyond the actual music glyphs.
    if (settings.interactive !== false) for (const system of result.systems) {
      const geometry = new SvgGeometry(system.node, measure, true)
      const systemBox = geometry.ink(element('g', {}, system.node.children))
      system.node.attributes['data-m3n-ink-bounds'] = [systemBox.left, systemBox.top, systemBox.right - systemBox.left, systemBox.bottom - systemBox.top].join(' ')
      for (const group of findAll(system.node, n => hasClass(n, 'measure'))) {
        const box = geometry.ink(element('g', {}, group.children))
        group.attributes['data-m3n-ink-bounds'] = [box.left, box.top, box.right - box.left, box.bottom - box.top].join(' ')
      }
    }
    cache.set(paged, { coreGap, markup: pages.map((page, index) => {
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
          { resolvedMusicGlyphs: settings.interactive === false },
        )
      }),
    })
  }
  const render = (paged: boolean, coreGap = settings.coreGap): SVGSVGElement[] => {
    engrave(paged, coreGap)
    const markup = cache.get(paged)!.markup
    return markup.map((text) => {
      const host = document.createElement('div')
      host.innerHTML = text
      const svg = host.querySelector('svg')!
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      resolveStaffText(svg, settings.measureNumbers, settings.interactive === false)
      svg.querySelectorAll('defs').forEach((node) => node.remove())
      svg.dataset.notation = 'staff'
      for (const event of svg.querySelectorAll<SVGGElement>('g.note[id], g.chord[id], g.tuplet[id], g.rest[id]')) {
        if (!/^m3n-e-\d+(?:-rend\d+)?(?:-n\d+)?$/.test(event.id)) continue
        const slot = /-n(\d+)$/.exec(event.id)?.[1]
        if (slot) event.dataset.m3nTupletSlot = String(Number(slot) - 1)
        event.dataset.m3nId = event.id.replace(/-n\d+$/, '').replace(/-rend\d+$/, '')
        if (expanded) event.dataset.m3nPasses = /-rend(\d+)/.exec(event.id)?.[1] ?? '1'
      }

      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String((width * svg.viewBox.baseVal.height) / svg.viewBox.baseVal.width))
      return svg
    })
  }
  const qualityUpperBound = (candidateWidth: number) => {
    const trials = plans(candidateWidth), baselineRows = trials[0]!.lines.length
    // A valid width requires its baseline to paginate. More-row alternatives
    // can never replace that baseline, even when their quality is higher.
    return Math.max(...trials.filter(plan => plan.lines.length <= baselineRows)
      .map(plan => scoreHorizontalQuality(candidateWidth, plan.quality)))
  }
  return Object.assign(render, {
    qualityUpperBound(candidateWidth = width) {
      return qualityUpperBound(candidateWidth)
    },
    /** Upper bound across every spacing trial, without vertical engraving.
     * Used only against an already valid one-page width in production search. */
    canExceedQuality(minimum: number, candidateWidth = width) {
      return qualityUpperBound(candidateWidth) >= minimum
    },
    /** Continuous geometry without generating or mounting an SVG candidate. */
    continuousHeight(coreGap = settings.coreGap) {
      return outputPages(layout(width), false, width, coreGap)[0]!.height + 2 * margin
    },
    /** Search only needs scalar ranking metadata, without walking SVG trees. */
    measurementInfo(candidateWidth = width) {
      const result = layout(candidateWidth)
      return {
        quality: { ...result.quality },
        rows: result.lines.length,
        pageCount: result.paginationError ? 0 : settings.coreGap === undefined ? result.pages.length : outputPages(result, true, candidateWidth).length,
      }
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
      if (settings.coreGap !== undefined) return outputPages(result, true, candidateWidth).length
      if (result.paginationError) throw result.paginationError
      return result.pages.length
    },
  })
}
