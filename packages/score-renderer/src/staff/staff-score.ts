import { SCORE_TEXT_FONT, scoreLayoutConfig, scoreLineQuality, scoreHorizontalQuality, scoreCoreGap, scoreMaximumCoreGap, scoreLyricGapScale } from '@m3n/numbered-notation'
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
  const horizontal = new Map<string, Array<{ spacing: number; lines: StaffLine[]; quality: ReturnType<typeof scoreLineQuality> }>>()
  const plans = (candidateWidth: number, rowCost = 1) => {
    validate(candidateWidth)
    const key = `${candidateWidth}:${rowCost}`
    let saved = horizontal.get(key)
    if (saved) return saved
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const musicWidth = candidateWidth - 2 * margin - gutter - scoreLayoutConfig.staff.rightGutter
    const available = musicWidth - scoreLayoutConfig.staff.contentEdgeInset
    saved = [0.25, ...scoreLayoutConfig.numbered.noteGapCandidates.slice(1).reverse().map(gap => .25 + (gap - scoreLayoutConfig.numbered.minimumNoteGap) / 48)].map(spacing => {
      signal?.throwIfAborted()
      const lines = planStaffLines(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum, rowCost)
      const quality = scoreLineQuality(lines.map(line => (line.reading ?? line.minimum) * STAFF_SCALE / available),
        lines.length ? Math.max(0, Math.min(1, 1 - lines.at(-1)!.target * STAFF_SCALE / available)) : 0)
      return { spacing, lines, quality }
    })
    horizontal.set(key, saved)
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
    const attempt = (spacing: number, rowCost = 1, incumbent?: Layout): Layout => {
      signal?.throwIfAborted()
      const { lines, quality } = plans(candidateWidth, rowCost).find(plan => plan.spacing === spacing)!
      // A one-page incumbent cannot lose on page count. For multipage
      // incumbents, complete every trial before comparing the page count.
      if (incumbent?.pages.length === 1) {
        const candidateScore = scoreHorizontalQuality(candidateWidth, quality)
        const previousScore = scoreHorizontalQuality(candidateWidth, incumbent.quality)
        if (lines.length > incumbent.lines.length || lines.length === incumbent.lines.length
          && (candidateScore < previousScore || candidateScore === previousScore && spacing >= incumbent.spacing)) return incumbent
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
    const consider = (candidate: Layout) => {
      if (candidate.paginationError) return
      const candidateScore = scoreHorizontalQuality(candidateWidth, candidate.quality)
      const selectedScore = scoreHorizontalQuality(candidateWidth, selected.quality)
      if (candidate.pages.length < selected.pages.length || candidate.pages.length === selected.pages.length
        && (candidate.lines.length < selected.lines.length || candidate.lines.length === selected.lines.length
        && (candidateScore > selectedScore || candidateScore === selectedScore && candidate.spacing < selected.spacing))) selected = candidate
    }
    if (!selected.paginationError) for (const spacing of scoreLayoutConfig.numbered.noteGapCandidates.slice(1).reverse().map(gap => .25 + (gap - scoreLayoutConfig.numbered.minimumNoteGap) / 48)) {
      consider(attempt(spacing, 1, selected))
    }
    // Only a short final page warrants extra whole-score engraving trials.
    // Alter the soft row cost, never collision minima or preferred advances.
    if (!selected.paginationError && selected.pages.length > 1 && selected.pages.at(-1)!.systems.length <= 2) {
      const spacing = selected.spacing
      const readingPenalty = (candidate: Layout) => candidate.lines.reduce((sum, line) => sum + (line.localReadingPenalty ?? 0), 0) / Math.max(1, candidate.lines.length)
      const limit = readingPenalty(selected) + .02
      for (const rowCost of [.85, 1.15]) {
        const candidate = attempt(spacing, rowCost)
        if (readingPenalty(candidate) <= limit) consider(candidate)
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
  // Include every row-cost variant: page-first selection can choose more
  // rows than the baseline, and tail repair can change horizontal quality.
  const allPlans = (candidateWidth: number) => [1, .85, 1.15].flatMap(rowCost => plans(candidateWidth, rowCost))
  const qualityUpperBound = (candidateWidth: number) => Math.max(...allPlans(candidateWidth)
    .map(plan => scoreHorizontalQuality(candidateWidth, plan.quality)))
  return Object.assign(render, {
    qualityUpperBound(candidateWidth = width) {
      return qualityUpperBound(candidateWidth)
    },
    /** Upper bound across every spacing trial, without vertical engraving.
     * Used only against an already valid one-page width in production search. */
    canExceedQuality(minimum: number, candidateWidth = width) {
      return qualityUpperBound(candidateWidth) >= minimum
    },
    /** A page contains nonoverlapping stave cores with at least the minimum
     * lyric-adjusted gap. Ignoring the header, all ink outside those cores and
     * page insets gives an upper bound on rows per page, hence a lower bound on
     * pages. This can certify losing multipage candidates before engraving. */
    canBeatPageQuality(pageCount: number, quality: number, candidateWidth = width) {
      if (settings.coreGap !== undefined) return pageCount === 1 ? qualityUpperBound(candidateWidth) >= quality : true
      const coreHeight = scoreLayoutConfig.staff.music
        + (projected.hasBass ? scoreLayoutConfig.staff.engine.initialBassY * STAFF_SCALE : 0)
      const gap = minimumGap * scoreLyricGapScale(minimumGap)
      const capacity = a4SourcePageHeight(candidateWidth) - 2 * margin
      const rowsPerPage = Math.max(1, Math.floor((capacity + gap + 1e-6) / (coreHeight + gap)))
      const trials = allPlans(candidateWidth)
      return trials.some(plan => {
        const lowerPages = Math.ceil(plan.lines.length / rowsPerPage)
        return lowerPages < pageCount || lowerPages === pageCount && scoreHorizontalQuality(candidateWidth, plan.quality) >= quality
      })
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
        pageFit: {
          minimumHeight: paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header.height, minimumGap, false)[0]!.height,
          capacity: a4SourcePageHeight(candidateWidth) - 2 * margin - scoreLayoutConfig.staff.pageInset,
          pageRows: result.pages.map(page => page.systems.length),
        },
        availableWidth: candidateWidth - 2 * margin - (projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter) - scoreLayoutConfig.staff.rightGutter - scoreLayoutConfig.staff.contentEdgeInset,
        pageCount: result.paginationError ? 0 : outputPages(result, true, candidateWidth).length,
        lines: result.lines.map((line, index) => ({
          core: { ...result.systems[index]!.core },
          inkHeight: result.systems[index]!.ink.bottom - result.systems[index]!.ink.top,
          minimum: line.minimum * STAFF_SCALE,
          target: line.target * STAFF_SCALE,
          localReadingPenalty: line.localReadingPenalty ?? 0,
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
