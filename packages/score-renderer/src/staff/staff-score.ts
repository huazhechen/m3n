import { SCORE_TEXT_FONT, scoreSvgFontFamilies, scoreLayoutConfig, scoreLineQuality, scoreCoreGap, scoreMaximumCoreGap, scorePhysicalSpacing, scoreLayoutCosts, planScoreLinesGlobally, greedyScoreLines, planScoreLinesWithinPages, scoreWholeRowFeasibility, scoreHeightEnvelope, scoreLyricGapScale } from '@m3n/numbered-notation'
import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import { findAll, hasClass, element, translate, moveInk, xml, SvgGeometry, type XmlNode } from './layout-svg.js'
import { prepareStaffLineGraph, STAFF_SCALE, type StaffLine } from './line-layout.js'
import { paginateStaff, type StaffSystem, type StaffPage } from './system-layout.js'
import { staffHeader } from './staff-header.js'
import { a4SourcePageHeight } from '../score-export.js'
import { needsStaffExpansion } from './display-score.js'
import { resolveStaffText } from './svg-text.js'
import { prepareStaffMeasurementTask, type StaffMeasurementTask } from './staff-measurement-task.js'
export { prepareStaffMeasurementTask, type StaffMeasurementTask } from './staff-measurement-task.js'
import { compareStaffAvoidance } from './staff-avoidance-comparison.js'
import { staffGlyphMetrics } from './staff-music-font.js'
import { staffMusicCentre, staffHeaderBlock } from './staff-row-pagination.js'
import { engraveStaffSystems } from './staff-system.js'

const ns = 'http://www.w3.org/2000/svg'
export type StaffSettings = {
  systemCjk?: boolean
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
  const minimumGap = settings.coreGap ?? scoreCoreGap(score)
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
  const referenceGap = scoreLayoutConfig.staff.music / 4 * scoreLayoutConfig.staff.spacingIncrementSpaces
  const availableAt = (candidateWidth: number) => candidateWidth - 2 * margin
    - (projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter)
    - scoreLayoutConfig.staff.rightGutter - scoreLayoutConfig.staff.contentEdgeInset
  const qualityFor = (candidateWidth: number, lines: StaffLine[]) => {
    const densities = lines.map(line => line.minimum * STAFF_SCALE / availableAt(candidateWidth))
    const spacing = scorePhysicalSpacing(lines.flatMap(line => line.unitRhythmicGap === undefined ? [] : [line.unitRhythmicGap]), referenceGap)
    const costs = scoreLayoutCosts(candidateWidth, densities)
    return { ...scoreLineQuality(densities, lines.length ? Math.max(0, 1 - lines.at(-1)!.target * STAFF_SCALE / availableAt(candidateWidth)) : 0),
      ...costs, ...spacing, totalCost: costs.fontSizeCost + costs.overflowCost + spacing.spacingCost }
  }
  type Layout = {
    systems: StaffSystem[]; pages: StaffPage[]; engraved?: boolean; fittedPages?: StaffPage[]; furniture: XmlNode[]
    header: ReturnType<typeof staffHeader>; lines: StaffLine[]; spacing: number; paginationError?: Error
    quality: ReturnType<typeof qualityFor>
  }
  const layouts = new Map<number, Layout>()
  const cache = new Map<boolean, { coreGap?: number; markup: string[] }>()
  const heightCache = (spacing: number) => {
    const key = `${spacing}:${Boolean(settings.measureNumbers)}`
    let saved = measurements.heights.get(key)
    if (saved) return saved
    saved = new WeakMap()
    const space = scoreLayoutConfig.staff.music / 4
    for (const m of projected.measures) {
      const prepared = measurements.preparation.measure(m, true, projected.hasBass, measure)
      const core = { top: scoreLayoutConfig.staff.music - space * .05,
        bottom: scoreLayoutConfig.staff.music * 2 + space * .05
          + (projected.hasBass ? scoreLayoutConfig.staff.engine.initialBassY * STAFF_SCALE : 0) }
      const ink = [core]
      prepared.entries.forEach((entries, lane) => {
        const dy = lane ? scoreLayoutConfig.staff.engine.initialBassY : 0
        for (const entry of entries) for (const note of entry.notes) {
          const glyph = staffGlyphMetrics(note.head, note.size)
          for (const head of note.heads) ink.push({ top: (dy + head.y + glyph.top) * STAFF_SCALE,
            bottom: (dy + head.y + glyph.bottom) * STAFF_SCALE })
          for (const symbol of note.symbols) {
            const glyph = staffGlyphMetrics(symbol.glyph, symbol.size)
            ink.push({ top: (dy + symbol.y + glyph.top) * STAFF_SCALE, bottom: (dy + symbol.y + glyph.bottom) * STAFF_SCALE })
          }
        }
      })
      saved.set(m, scoreHeightEnvelope({ height: core.bottom, core,
        ink: ink.map(box => ({ ...box, left: 0, right: 1 })) }, staffMusicCentre,
        [m.melody, m.bass].some(lane => lane.some(event => event.lyrics.some(lyric => lyric.text.trim())))))
    }
    measurements.heights.set(key, saved)
    return saved
  }
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
    const trials = scoreLayoutConfig.staff.noteGapCandidates.map(spacing => {
      const graph = prepareStaffLineGraph(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum)
      const heights = heightCache(spacing)
      const rowCache = new Map<string, StaffSystem>()
      const rowFor = (start: number, end: number, target?: number) => {
        const key = `${start}:${end}:${target ?? availableAt(candidateWidth) / STAFF_SCALE}`
        let system = rowCache.get(key)
        if (!system) {
          const line = graph.makeLines([end], false, start)[0]!
          if (target !== undefined) line.target = target
          const prefix = start ? graph.makeLines([start], false) : []
          const suffix = end < graph.measured.length ? graph.makeLines([graph.measured.length], false, end) : []
          // Outside rows supply only relation endpoint order; engrave this row
          // alone. Its geometry is independent of how that outside is broken.
          system = engraveStaffSystems(projected, [...prefix, line, ...suffix], musicWidth, measure, spacing,
            Boolean(settings.measureNumbers), tempoScale, measurements.preparation, prefix.length)[0]!
          system.envelope = scoreHeightEnvelope({ height: system.ink.bottom, core: system.core, ink: [system.ink] },
            staffMusicCentre, Boolean(system.hasLyrics))
          rowCache.set(key, system)
        }
        return system
      }
      const systemsFor = (ends: number[]) => {
        let start = 0
        const lines = graph.makeLines(ends)
        return ends.map((end, index) => { const system = rowFor(start, end, lines[index]!.target); start = end; return system })
      }
      const evaluate = (ends: number[]) => {
        signal?.throwIfAborted()
        const systems = systemsFor(ends)
        try { return { ends, pages: paginateStaff(systems, height, header.height, minimumGap, true, minimumGap).length, value: ends } }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('单个谱行')) throw error
          return { ends, pages: Infinity, value: ends }
        }
      }
      const greedy = evaluate(greedyScoreLines(graph.candidates)), optimum = evaluate(planScoreLinesGlobally(graph.candidates))
      const canFit = optimum.pages > greedy.pages ? scoreWholeRowFeasibility(graph.candidates,
        (start, _end) => {
          const original = graph.measured[start]!.measure
          const envelope = heights.get(original) ?? heights.get(projected.measures.find(m => original.id.startsWith(m.id + '-fragment-'))!)!
          // Only the invariant first staff is a safe lower bound. A canonical
          // row's curves, lyrics and inter-staff expansion may overestimate.
          const block = { ...staffHeaderBlock(scoreLayoutConfig.staff.music),
            core: { top: 0, bottom: Math.min(scoreLayoutConfig.staff.music, envelope.coreAbove + envelope.coreBelow) },
            coreGapScale: scoreLyricGapScale(minimumGap),
            ...(start === 0 ? { coreGapBefore: 0 } : {}),
            gapBefore: start > 0 && original.section ? scoreLayoutConfig.staff.sectionGap : 0 }
          return block
        }, [staffHeaderBlock(header.height)],
        { pageHeight: height, margin: scoreLayoutConfig.staff.pageInset, gap: minimumGap, headerGap: 0, ratio: .3 }) : undefined
      const plan = planScoreLinesWithinPages(graph.candidates, greedy, optimum, evaluate, undefined, canFit)
      const lines = graph.makeLines(plan.ends)
      let rowStart = 0
      const finalSystems = lines.map((line, index) => {
        const end = plan.ends[index]!, system = rowFor(rowStart, end, line.target)
        rowStart = end; return system
      })
      return { spacing, lines, proxies: finalSystems, quality: qualityFor(candidateWidth, lines), pages: plan.pages }
    }).sort((a, b) => a.quality.spacingCost + a.quality.overflowCost - b.quality.spacingCost - b.quality.overflowCost || b.spacing - a.spacing)
    const trial = trials.reduce((best, candidate) => candidate.pages < best.pages ? candidate : best)
    // Candidate rows are already measured and cached at their actual width.
    // Reuse the chosen row nodes for output as well as numeric pagination.
    const systems = trial.proxies
    for (const system of systems) {
      translate(system.node, gutter / STAFF_SCALE, 0)
      system.pieces = system.pieces.map(piece => moveInk(piece, gutter, 0))
      system.spacingPieces = system.spacingPieces.map(piece => moveInk(piece, gutter, 0))
      system.edgePieces = system.edgePieces.map(piece => ({ ...moveInk(piece, gutter, 0), gap: piece.gap }))
      system.ink = moveInk(system.ink, gutter, 0); system.core = moveInk(system.core, gutter, 0)
    }
    let pages: StaffPage[] = [], paginationError: Error | undefined
    try { pages = paginateStaff(systems, height, header.height, minimumGap, true, minimumGap) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes('单个谱行')) throw error
      paginationError = new Error('单个五线谱谱行无法放入A4页面。')
    }
    const selected: Layout = { systems, pages, paginationError, furniture: [], header, lines: trial.lines, spacing: trial.spacing, quality: trial.quality, engraved: true }
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
      host.innerHTML = scoreSvgFontFamilies(text, settings.systemCjk)
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
  const qualityUpperBound = (candidateWidth: number) => 1 / (1 + scoreLayoutCosts(candidateWidth, []).fontSizeCost)
  return Object.assign(render, {
    qualityUpperBound(candidateWidth = width) { return qualityUpperBound(candidateWidth) },
    canExceedQuality(minimum: number, candidateWidth = width) { return qualityUpperBound(candidateWidth) >= minimum },
    canBeatPageQuality(pageCount: number, quality: number, candidateWidth = width) {
      return pageCount !== 1 || qualityUpperBound(candidateWidth) >= quality
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
    /** Compare scalar row/measure avoidance without changing production layout. */
    avoidanceComparison(candidateWidth = width) {
      const result = layout(candidateWidth)
      const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
      return compareStaffAvoidance(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin,
        result.header.height, minimumGap, measure, gutter)
    },
    /** Detached metadata for geometry audits and width selection. */
    layoutInfo(candidateWidth = width) {
      const result = layout(candidateWidth)
      return {
        displayedEvents,
        heightEnvelopeDiagnostics: result.systems.flatMap((system, index) => {
          const envelope = system.envelope!
          const above = Math.max(0, staffMusicCentre - envelope.coreAbove - envelope.extraAbove - system.ink.top)
          const below = Math.max(0, system.ink.bottom - staffMusicCentre - envelope.coreBelow - envelope.extraBelow)
          const coreAbove = Math.max(0, staffMusicCentre - envelope.coreAbove - system.core.top)
          const coreBelow = Math.max(0, system.core.bottom - staffMusicCentre - envelope.coreBelow)
          return above > 1e-6 || below > 1e-6 || coreAbove > 1e-6 || coreBelow > 1e-6
            ? [{ row: index + 1, above, below, coreAbove, coreBelow, measures: result.lines[index]!.measures.map(m => m.id) }] : []
        }),
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
          unitRhythmicGap: line.unitRhythmicGap,
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
