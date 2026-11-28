import { scorePageCost } from '@m3n/numbered-notation/layout-quality'
import { scoreWidthPolicyState, compareScoreSpacingTrials, scoreSpacingTrialPageCeiling, scoreWidthCandidateCanWin, scoreWidthCandidatePageCeiling, planScoreTier, scoreTierDensityTarget, scoreVerticalSpacing, scoreFixedVerticalSpacing, scorePageFeasibility, scoreCorePageLowerBound, scoreHeightEnvelope, scoreEnvelopeBlock, scoreLayoutConfig, scoreLineQuality, scoreHeaderGap, scorePhysicalSpacing, scoreLayoutCosts, scoreLyricGapScale } from '@m3n/numbered-notation/layout'
import { SCORE_TEXT_FONT, scoreSvgFontFamilies } from '@m3n/numbered-notation'
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
import { staffGlyphMetrics } from './staff-music-font.js'
import { staffMusicCentre, staffHeaderBlock, staffRowBlock, paginateStaffBlocks, staffPagesFromPlacement } from './staff-row-pagination.js'
import { engraveStaffSystems, prepareStaffSystems, type PreparedStaffSystem } from './staff-system.js'
import { proxyScoreWidthInk, proxyScoreWidthPartition, proxyScoreWidthBounds, scoreWidthProxyKey } from '@m3n/numbered-notation/layout'

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
  const vertical = scoreVerticalSpacing('staff')
  const minimumGap = vertical.minimum
  const headerGap = scoreHeaderGap(minimumGap)
  const outputGap = settings.coreGap ?? minimumGap
  const margin = settings.pageMargin ?? 0
  const validate = (w: number) => {
    if (!Number.isFinite(w) || w < scoreLayoutConfig.staff.minimumWidth || !Number.isFinite(minimumGap) || minimumGap < 0 || !Number.isFinite(outputGap) || outputGap < 0 || !Number.isFinite(margin) || margin < 0 || margin * 2 + scoreLayoutConfig.staff.minimumContentWidth > w)
      throw new Error('五线谱版宽、页边距或行距无效。')
  }
  validate(width)
  const projected = measurements.document
  const expanded = needsStaffExpansion(score)
  const tempoScale = settings.tempoScale ?? 1
  const measure = measurements.measure
  const tightTier = scoreLayoutConfig.staff.noteGapCandidates[0]!, looseTier = scoreLayoutConfig.staff.noteGapCandidates.at(-1)!
  const staffSpace = scoreLayoutConfig.staff.music / 4
  const availableAt = (candidateWidth: number) => candidateWidth - 2 * margin
    - (projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter)
    - scoreLayoutConfig.staff.rightGutter - scoreLayoutConfig.staff.contentEdgeInset
  const qualityFor = (candidateWidth: number, lines: StaffLine[], verticalCost = 0) => {
    const densities = lines.map(line => line.minimum * STAFF_SCALE / availableAt(candidateWidth))
    const spacing = scorePhysicalSpacing(lines.flatMap(line => line.rhythmicGaps ?? []), staffSpace * looseTier!, staffSpace * tightTier!,
      lines.flatMap(line => line.unitRhythmicGap === undefined ? [] : [line.unitRhythmicGap]), scoreLayoutConfig.staff.horizontalComfort)
    const costs = scoreLayoutCosts(candidateWidth, densities)
    return { ...scoreLineQuality(densities, lines.length ? Math.max(0, 1 - lines.at(-1)!.target * STAFF_SCALE / availableAt(candidateWidth)) : 0),
      ...costs, ...spacing, verticalCost, totalCost: costs.fontSizeCost + costs.overflowCost + spacing.spacingCost + verticalCost }
  }
  type Layout = {
    systems: StaffSystem[]; pages: StaffPage[]; gutterPublished?: boolean; engraved?: boolean; fittedPages?: StaffPage[]; furniture: XmlNode[]
    header: ReturnType<typeof staffHeader>; lines: StaffLine[]; spacing: number; paginationError?: Error
    quality: ReturnType<typeof qualityFor>
  }
  const layouts = new Map<number, Layout>()
  const cache = new Map<boolean, { coreGap?: number; markup: string[] }>()
  const lowerEnvelopes = measurements.lowerEnvelopes
  // Fixed noteheads and unexpanded staves provide page-edge/core lower
  // bounds only; unresolved horizontal ink never becomes a collision obstacle.
  const lowerEnvelopeFor = (item: (typeof projected.measures)[number]) => {
    let saved = lowerEnvelopes.get(item)
    if (saved) return saved
    const space = scoreLayoutConfig.staff.music / 4
    const core = { top: scoreLayoutConfig.staff.music - space * .05,
      bottom: scoreLayoutConfig.staff.music * 2 + space * .05 + (projected.hasBass ? scoreLayoutConfig.staff.engine.initialBassY * STAFF_SCALE : 0) }
    let top = core.top, bottom = core.bottom
    const prepared = measurements.preparation.measure(item, true, projected.hasBass, measure)
    prepared.entries.forEach((entries, lane) => {
      // Interstaff avoidance can only move the bass down. Its initial bottom
      // is a lower bound, but its initial top cannot bound the final row top.
      const dy = lane ? scoreLayoutConfig.staff.engine.initialBassY : 0
      for (const entry of entries) for (const note of entry.notes) {
        const glyph = staffGlyphMetrics(note.head, note.size)
        const restShift = note.rest && note.dur === 1 ? -scoreLayoutConfig.staff.music / STAFF_SCALE / 4 : 0
        for (const head of note.heads) {
          if (!lane) top = Math.min(top, (dy + head.y + restShift + glyph.top) * STAFF_SCALE)
          bottom = Math.max(bottom, (dy + head.y + restShift + glyph.bottom) * STAFF_SCALE)
        }
        for (const symbol of note.symbols) {
          if (!symbol.glyph.startsWith('accidental') && symbol.glyph !== 'augmentationDot') continue
          const ink = staffGlyphMetrics(symbol.glyph, symbol.size ?? note.size)
          if (!lane) top = Math.min(top, (dy + symbol.y + ink.top) * STAFF_SCALE)
          bottom = Math.max(bottom, (dy + symbol.y + ink.bottom) * STAFF_SCALE)
        }
        // Stem lengths now compact at staff boundaries and flexible beam
        // directions are chosen after exact attachment placement. Their
        // initial tips are not invariant lower bounds; keep the immutable
        // heads, accidentals and dots above as the coarse feasibility proof.
      }
    })
    saved = scoreHeightEnvelope({ height: bottom, core, ink: [{ left: 0, right: 1, top, bottom }] }, staffMusicCentre,
      [item.melody, item.bass].some(lane => lane.some(event => [event, ...(event.children ?? [])].some(child => child.lyrics.some(lyric => lyric.text.trim())))))
    lowerEnvelopes.set(item, saved)
    return saved
  }
  const canFitLower = (candidateWidth: number, ceiling: number) => {
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const musicWidth = candidateWidth - 2 * margin - gutter - scoreLayoutConfig.staff.rightGutter
    const header = staffHeader(score, candidateWidth - 2 * margin, measure, settings.transpose)
    for (const spacing of scoreLayoutConfig.staff.noteGapCandidates) {
      const graph = prepareStaffLineGraph(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum)
      const envelopes = graph.measured.map(({ measure }) => lowerEnvelopeFor(measure))
      let witnessCache=measurements.feasibilityWitnesses.get(spacing)
      if(!witnessCache)measurements.feasibilityWitnesses.set(spacing,witnessCache={})
      const feasible = scorePageFeasibility(graph.candidates, (start, end) => {
        const members = envelopes.slice(start, end)
        const coreAbove = Math.max(...members.map(e => e.coreAbove)), coreBelow = Math.max(...members.map(e => e.coreBelow))
        const envelope = { coreAbove, coreBelow,
          extraAbove: Math.max(...members.map(e => e.coreAbove + e.extraAbove)) - coreAbove,
          extraBelow: Math.max(...members.map(e => e.coreBelow + e.extraBelow)) - coreBelow,
          hasLyrics: members.some(e => e.hasLyrics) }
        return { ...scoreEnvelopeBlock(envelope, 1, staffMusicCentre), resolvedInk: false,
          coreGapScale: envelope.hasLyrics ? scoreLyricGapScale(minimumGap) : 1,
          coreGapBefore: graph.measured[start]!.measure.coreGapBefore }
      }, [staffHeaderBlock(header)], { pageHeight: a4SourcePageHeight(candidateWidth) - 2 * margin,
        margin: scoreLayoutConfig.staff.pageInset, gap: minimumGap, vertical, headerGap, witnessCache })
      if (feasible(graph.candidates, ceiling)) return true
    }
    return false
  }
  const pendingLayouts = new Map<number, ReturnType<typeof prepareLayout>>()
  const prepareLayout = (candidateWidth: number, preflight = false) => {
    validate(candidateWidth)
    signal?.throwIfAborted()
    const innerWidth = candidateWidth - 2 * margin
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const musicWidth = innerWidth - gutter - scoreLayoutConfig.staff.rightGutter
    const header = staffHeader(score, innerWidth, measure, settings.transpose)
    const height = a4SourcePageHeight(candidateWidth) - 2 * margin
    let bestPageCount = Infinity
    let incumbent: { pages: number; cost: number; spacing: number } | undefined
    let horizontalLowerBound = Infinity, rowCount = Infinity
    const lowerCosts: (() => number)[] = []
    let lowerBound: number | undefined
    const completions = scoreLayoutConfig.staff.noteGapCandidates.map(spacing => {
      const graph = prepareStaffLineGraph(projected, musicWidth, Boolean(score.equalMeasures), measure, spacing, measurements.minimum)
      const chosenEnds = planScoreTier(graph.candidates, scoreTierDensityTarget(spacing, scoreLayoutConfig.staff.noteGapCandidates))
      if (!chosenEnds) throw new Error('换行候选无法覆盖完整内容。')
      const preparedLines = graph.makeLines(chosenEnds)
      rowCount = Math.min(rowCount, preparedLines.length)
      if (preflight) {
      const horizontal = qualityFor(candidateWidth, preparedLines).totalCost
      horizontalLowerBound = Math.min(horizontalLowerBound, horizontal)
      lowerCosts.push(() => {
      const envelopes = preparedLines.map(line => line.measures.map(member => lowerEnvelopeFor(member.measure)))
      const blocks = envelopes.map(members => {
        const coreAbove = Math.max(...members.map(e => e.coreAbove)), coreBelow = Math.max(...members.map(e => e.coreBelow))
        const envelope = { coreAbove, coreBelow,
          extraAbove: Math.max(...members.map(e => e.coreAbove + e.extraAbove)) - coreAbove,
          extraBelow: Math.max(...members.map(e => e.coreBelow + e.extraBelow)) - coreBelow,
          hasLyrics: members.some(e => e.hasLyrics) }
        return { ...scoreEnvelopeBlock(envelope, 1, staffMusicCentre), resolvedInk: false,
          coreGapScale: envelope.hasLyrics ? scoreLyricGapScale(minimumGap) : 1 }
      })
      const pages = scoreCorePageLowerBound([staffHeaderBlock(header), ...blocks], {
        pageHeight: height, margin: scoreLayoutConfig.staff.pageInset, gap: minimumGap, vertical, headerGap,
      })
      return horizontal + scorePageCost(pages)
      })
      }
      return () => {
      const widthBound = scoreWidthPolicyState().widthBound
      // Preserve the last occurrence of a tuplet parent across fragments, just
      // as the complete line scan does, without rescanning the score per row.
      const eventMeasures = new Map<string, number>()
      graph.measured.forEach((member, index) => {
        for (const lane of [member.measure.melody, member.measure.bass]) for (const event of lane) {
          eventMeasures.set(event.id, index)
          for (const child of event.children ?? []) eventMeasures.set(child.id, index)
        }
      })
      const rowCache = new Map<string, StaffSystem>()
      const stagedRows = new Map<string, PreparedStaffSystem>()
      const rowKey = (start: number, end: number, target?: number) => `${start}:${end}:${target ?? availableAt(candidateWidth) / STAFF_SCALE}`
      const endpointFor = (start: number, end: number) => (id: string) => {
        const index = eventMeasures.get(id)
        return index === undefined ? undefined : index < start ? -1 : index >= end ? 1 : 0
      }
      const prepareRow = (start: number, end: number, target?: number) => {
        const key = rowKey(start, end, target)
        let staged = stagedRows.get(key)
        if (!staged) {
          const line = graph.makeLines([end], false, start, false)[0]!
          if (target !== undefined) line.target = target
          staged = prepareStaffSystems(projected, [line], musicWidth, measure, spacing, Boolean(settings.measureNumbers), tempoScale,
            measurements.preparation, endpointFor(start,end))[0]!
          stagedRows.set(key, staged)
        }
        return staged
      }
      const rowFor = (start: number, end: number, target?: number) => {
        const key = rowKey(start,end,target)
        let system = rowCache.get(key)
        if (!system && stagedRows.has(key)) {
          system = stagedRows.get(key)!.complete()
          rowCache.set(key, system)
          stagedRows.delete(key)
        }
        if (!system) {
          const line = graph.makeLines([end], false, start, false)[0]!
          if (target !== undefined) line.target = target
          const proxyRows = (scoreWidthPolicyState()).__m3nExperimentalRowReuse ? measurements.proxyRows : undefined
          const proxyKey = proxyRows ? scoreWidthProxyKey(spacing,Boolean(settings.measureNumbers),line.measures.map(({measure}) => measurements.proxyIdentityFor(measure))) : undefined
          const savedProxy = proxyKey === undefined ? undefined : proxyRows?.get(proxyKey)
          if (savedProxy) {
            const warp = <T extends import('./layout-svg.js').Ink>(pieces: readonly T[]) => proxyScoreWidthInk(pieces,0,savedProxy.width,0,line.target*STAFF_SCALE)
            const old = savedProxy.system
            const partition = proxyScoreWidthPartition(old.pieces,old.spacingPieces,0,savedProxy.width,0,line.target*STAFF_SCALE)
            system = {...old, pieces:partition.pieces,spacingPieces:partition.included,boundaryPieces:partition.excluded,edgePieces:warp(old.edgePieces),
              ink:proxyScoreWidthBounds(old.ink,0,savedProxy.width,0,line.target*STAFF_SCALE),
              core:proxyScoreWidthBounds(old.core,0,savedProxy.width,0,line.target*STAFF_SCALE)}
            rowCache.set(key,system)
            return system
          }
          // Every row requested here is immediately consumed by exact
          // pagination. Keep numeric drawing, but collect its pieces now:
          // deferred collection would first traverse the same ink for bounds.
          system = engraveStaffSystems(projected, [line], musicWidth, measure, spacing,
            Boolean(settings.measureNumbers), tempoScale, measurements.preparation, 0, id => {
              const index = eventMeasures.get(id)
              return index === undefined ? undefined : index < start ? -1 : index >= end ? 1 : 0
            }, true, false)[0]!
          rowCache.set(key, system)
          if (proxyKey !== undefined) proxyRows!.set(proxyKey,{width:line.target*STAFF_SCALE,system})
        }
        return system
      }
      const linePlans = new Map<string, StaffLine[]>([[chosenEnds.join(':'), preparedLines]])
      const linesFor = (ends: number[]) => {
        const key = ends.join(':')
        let lines = linePlans.get(key)
        if (!lines) { lines = graph.makeLines(ends); linePlans.set(key, lines) }
        return lines
      }
      const evaluate = (ends: number[]) => {
        signal?.throwIfAborted()
        const lines = linesFor(ends)
        const horizontal = qualityFor(candidateWidth, lines, 0)
        const localCeiling = scoreSpacingTrialPageCeiling(horizontal.spacingCost + horizontal.overflowCost, spacing, incumbent, ends.length + 1)
        const globalCeiling = scoreWidthCandidatePageCeiling(candidateWidth, horizontal.totalCost, ends.length + 1, widthBound)
        const limit = Math.min(localCeiling ?? Infinity, globalCeiling ?? Infinity)
        const ceiling = Number.isFinite(limit) ? limit : undefined
        if (ceiling === 0) return { ends, pages: Infinity, verticalCost: Infinity }
        // Optional proof work pays off for long plans. Short plans are cheaper
        // to finish directly; bypassing this check never omits exact candidates.
        if (ceiling !== undefined && lines.length >= 16 && !projected.hasBass) {
          try {
            let start = 0
            const lowerBlocks = [staffHeaderBlock(header), ...ends.map((end, index) => {
              const first = start; start = end
              return () => prepareRow(first, end, lines[index]!.target).lowerBound
            })]
            const pages = scoreCorePageLowerBound(lowerBlocks, {
              pageHeight: height, margin: scoreLayoutConfig.staff.pageInset, gap: minimumGap, vertical, headerGap,
              directional: true, pageCeiling: ceiling,
            })
            if (pages > ceiling) return { ends, pages: Infinity, verticalCost: Infinity }
          } catch {
            // Failure to establish a bound is not a certificate of rejection.
            // Complete exact rows, retaining any successfully prepared prefix.
            signal?.throwIfAborted()
          }
        }
        let start = 0
        const blocks = [staffHeaderBlock(header), ...ends.map((end, index) => {
          const first = start; start = end
          return () => staffRowBlock(rowFor(first, end, lines[index]!.target), index, minimumGap)
        })]
        try {
          const result = paginateStaffBlocks(blocks, height, minimumGap, true, vertical?.maximum ?? minimumGap, headerGap, vertical, ceiling)
          const cost = horizontal.spacingCost + horizontal.overflowCost + (result.verticalCost ?? 0)
          const candidate = { pages: result.heights.length, cost, spacing }
          if (!incumbent || compareScoreSpacingTrials(candidate, incumbent) < 0) incumbent = candidate
          return { ends, pages: result.heights.length, verticalCost: result.verticalCost ?? 0, value: ends, placement: result }
        }
        catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'M3N_PAGE_BOUND_REJECTED')
            return {ends, pages:Infinity, verticalCost:Infinity}
          if (!(error instanceof Error) || !error.message.includes('单个谱行')) throw error
          return { ends, pages: Infinity, verticalCost: Infinity, value: ends }
        }
      }
      const plan = {...evaluate(chosenEnds), ends: chosenEnds}
      if (!Number.isFinite(plan.pages) && (widthBound || Number.isFinite(bestPageCount))) return []
      bestPageCount = Math.min(bestPageCount, plan.pages)
      const lines = linesFor(plan.ends)
      let rowStart = 0
      const finalSystems = lines.map((line, index) => {
        const end = plan.ends[index]!, system = rowFor(rowStart, end, line.target)
        rowStart = end; return system
      })
      return [{ spacing, lines, proxies: finalSystems, quality: qualityFor(candidateWidth, lines, plan.verticalCost), pages: plan.pages, placement: 'placement' in plan ? plan.placement : undefined }]
      }
    })
    return { get lowerBound() { return lowerBound ??= Math.min(...lowerCosts.map(lower => lower())) }, horizontalLowerBound, rowCount,
      complete: (): Layout => {
      const widthBound = scoreWidthPolicyState().widthBound
      const trials = completions.flatMap(complete => complete())
    if (!trials.length && widthBound)
      throw Object.assign(new Error('Exact total-cost bound cannot improve the incumbent'), { code: 'M3N_WIDTH_QUALITY_PRUNED' })
    if (!trials.length) throw new Error('五线谱间距候选为空。')
    const trial = trials.reduce((best, candidate) => compareScoreSpacingTrials(
      { pages: candidate.pages, cost: candidate.quality.spacingCost + candidate.quality.overflowCost + candidate.quality.verticalCost, spacing: candidate.spacing },
      { pages: best.pages, cost: best.quality.spacingCost + best.quality.overflowCost + best.quality.verticalCost, spacing: best.spacing }) < 0 ? candidate : best)
    // Candidate rows are already measured and cached at their actual width.
    // Reuse the chosen row nodes for output as well as numeric pagination.
    if (widthBound && !scoreWidthCandidateCanWin(candidateWidth, trial.quality.totalCost, trial.pages, widthBound))
      throw Object.assign(new Error('Exact total-cost bound cannot improve the incumbent'), { code: 'M3N_WIDTH_QUALITY_PRUNED' })
    const systems = trial.proxies
    let pages: StaffPage[] = [], paginationError: Error | undefined
    try { pages = trial.placement ? staffPagesFromPlacement(systems, trial.placement)
      : paginateStaff(systems, height, header, minimumGap, true, vertical?.maximum ?? minimumGap, headerGap, vertical) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes('单个谱行')) throw error
      paginationError = new Error('单个五线谱谱行无法放入A4页面。')
    }
    const selected: Layout = { systems, pages, paginationError, furniture: [], header, lines: trial.lines, spacing: trial.spacing, quality: trial.quality, engraved: true }
    layouts.set(candidateWidth, selected)
    pendingLayouts.delete(candidateWidth)
    return selected
      },
    }
  }
  const layout = (candidateWidth: number): Layout => layouts.get(candidateWidth)
    ?? (pendingLayouts.get(candidateWidth) ?? prepareLayout(candidateWidth)).complete()
  const publishGutter = (result: Layout) => {
    if (result.gutterPublished) return
    result.gutterPublished = true
    const gutter = projected.hasBass ? scoreLayoutConfig.staff.bassGutter : scoreLayoutConfig.staff.singleGutter
    const systems = result.systems
    for (const system of systems) {
      system.materializeInk?.()
      translate(system.node, gutter / STAFF_SCALE, 0)
      system.pieces = system.pieces.map(piece => moveInk(piece, gutter, 0))
      system.spacingPieces = system.spacingPieces.map(piece => moveInk(piece, gutter, 0))
      system.boundaryPieces = system.boundaryPieces?.map(piece => moveInk(piece, gutter, 0))
      system.edgePieces = system.edgePieces.map(piece => ({ ...moveInk(piece, gutter, 0), gap: piece.gap }))
      system.ink = moveInk(system.ink, gutter, 0); system.core = moveInk(system.core, gutter, 0)
    }
  }
  const outputPages = (result: Layout, paged: boolean, candidateWidth = width, coreGap = settings.coreGap) => {
    const gap = coreGap ?? minimumGap
    if (!Number.isFinite(gap) || gap < 0) throw new Error('五线谱行距无效。')
    if (paged && coreGap === undefined) {
      if (result.paginationError) throw result.paginationError
      return result.fittedPages ??= paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header, gap, true, vertical?.maximum ?? gap, headerGap, vertical)
    }
    return paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header, gap, paged, coreGap === undefined ? vertical?.maximum ?? gap : gap, headerGap, coreGap === undefined ? vertical : scoreFixedVerticalSpacing(coreGap))
  }
  const engrave = (paged: boolean, coreGap = settings.coreGap) => {
    const saved = cache.get(paged)
    if (saved && saved.coreGap === coreGap) return
    const result = layout(width)
    publishGutter(result)
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
          content.push(element('g', { transform: `translate(${margin} ${margin})` }, [result.header.atRowGap(page.gap).node]))
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
              ...(measure.designMetrics ? { 'data-m3n-metrics': 'font-design' } : {}),
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
      if (pageCount === 1) return qualityUpperBound(candidateWidth) >= quality
      // Pages rank before quality. Exclude only when every tier is unable to
      // reach the winner's pages, or cannot save a page and loses on font alone.
      const ceiling = qualityUpperBound(candidateWidth) < quality ? pageCount - 1 : pageCount
      return canFitLower(candidateWidth, ceiling)
    },
    /** Continuous geometry without generating or mounting an SVG candidate. */
    continuousHeight(coreGap = settings.coreGap) {
      return outputPages(layout(width), false, width, coreGap)[0]!.height + 2 * margin
    },
    prepareMeasurement(candidateWidth = width) {
      const prepared = prepareLayout(candidateWidth, true)
      pendingLayouts.set(candidateWidth, prepared)
      return { get lowerBound() { return prepared.lowerBound }, horizontalLowerBound: prepared.horizontalLowerBound, rowCount: prepared.rowCount }
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
      publishGutter(result)
      return {
        displayedEvents: new Set(projected.measures.flatMap(measure => [measure.melody, measure.bass]
          .flatMap(lane => lane.flatMap(event => event.children ?? [event])).map(event => event.id))).size,
        hasBass: projected.hasBass,
        spacing: result.spacing,
        quality: { ...result.quality },
        headerHeight: result.header.atRowGap(settings.coreGap ?? result.pages[0]?.gap ?? minimumGap).height,
        pageFit: {
          minimumHeight: paginateStaff(result.systems, a4SourcePageHeight(candidateWidth) - 2 * margin, result.header, minimumGap, false, minimumGap, headerGap)[0]!.height,
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
          rhythmicGaps: [...(line.rhythmicGaps ?? [])],
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
