import type { ScoreDocument } from '@m3n/notation'
import { scoreCoreGap, scoreMaximumCoreGap, NumberedTextMeasurementCache, NumberedLayoutTask, renderSharedPreparedNumberedNotationScores, PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { a4SourcePageHeight } from '@m3n/score-renderer/view'
import type { prepareStaffScore, StaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureNumberedWidth, type WidthTimings } from '../../tools/lib/numbered-width-measurement.mjs'
import { numberedLayoutScore, type WidthMeasurement } from '../../tools/scorebook-width.mjs'
import type { NotationMode } from './renderer-settings'

export type ScorebookDisplaySettings = { notationMode: NotationMode; measureNumbers: boolean }
type StaffRender = Awaited<ReturnType<typeof prepareStaffScore>>
export type ScorebookCacheStats = { hits: number; misses: number; widthMisses: number; retainedRows: number; peakRows: number; finalLayoutMs: number; finalSvgMs: number }
export type PreparedBookScore = {
  renderPaged(): (string | SVGSVGElement)[] | Promise<(string | SVGSVGElement)[]>
  numbered?: PreparedNumberedNotationScore
  staff?: { document: ScoreDocument; task: StaffMeasurementTask }
}

// Keep this closure separate from measure(): no measured render/layout may be
// retained by the returned candidate. A whole book has thousands of candidates.
function deferredStaffScore(staff: typeof import('@m3n/score-renderer/staff'), document: ScoreDocument,
  task: StaffMeasurementTask, width: number, settings: ScorebookDisplaySettings, signal: AbortSignal,
  take: (document: ScoreDocument, width: number) => StaffRender | undefined, stats: ScorebookCacheStats): PreparedBookScore {
  return {
    staff: { document, task },
    async renderPaged() {
      signal.throwIfAborted()
      const started = performance.now()
      const render = take(document, width) ?? await staff.prepareStaffScore(document, { ...settings, width, interactive: false }, signal, task)
      render.pageCount(true)
      stats.finalLayoutMs += performance.now() - started
      const drawing = performance.now()
      const markup = render(true)
      stats.finalSvgMs += performance.now() - drawing
      return markup
    },
  }
}

// Retain the immutable inputs, not every candidate's placed rows. Rebuild only
// the widths selected by chapter packing, using the same text metrics and fonts.
function deferredNumberedScore(document: ScoreDocument,
  settings: ConstructorParameters<typeof PreparedNumberedNotationScore>[1], signal: AbortSignal): PreparedBookScore {
  const prepare = () => {
    signal.throwIfAborted()
    return new PreparedNumberedNotationScore(document, settings)
  }
  return {
    get numbered() { return prepare() },
    renderPaged: () => prepare().renderPaged(),
  }
}

/** Both book formats use the reader's measurement adapters and export primitives. */
export async function prepareScorebookRenderer(settings: ScorebookDisplaySettings, signal: AbortSignal, auditLayout: boolean) {
  // Only the current song needs cross-width preparations. Deferred winners
  // keep immutable inputs and shared text metrics, never a task holding every
  // measured song's geometry. Final engraving rebuilds the exact selected width.
  const numberedSettings = { fixedDo: settings.notationMode === 'fixed', measureNumbers: settings.measureNumbers,
    textMeasurementCache: new NumberedTextMeasurementCache(), layoutTask: new NumberedLayoutTask() }
  let numberedDocument: ScoreDocument | undefined
  const staff = settings.notationMode === 'staff' ? await import('@m3n/score-renderer/staff') : undefined
  const staffMeasure = staff ? await import('../../tools/lib/staff-width-measurement.mjs') : undefined
  const tasks = new Map<ScoreDocument, StaffMeasurementTask>()
  const cacheStats: ScorebookCacheStats = { hits: 0, misses: 0, widthMisses: 0, retainedRows: 0, peakRows: 0, finalLayoutMs: 0, finalSvgMs: 0 }
  const winners = new Map<ScoreDocument, { candidate: WidthMeasurement; render: StaffRender }>()
  const sealed = new Set<ScoreDocument>()
  const take = (document: ScoreDocument, width: number) => {
    const saved = winners.get(document)
    if (!saved) { cacheStats.misses++; return }
    winners.delete(document); cacheStats.retainedRows -= saved.candidate.rows
    if (saved.candidate.width !== width) { cacheStats.widthMisses++; return }
    cacheStats.hits++
    return saved.render
  }
  const staffTask = async (document: ScoreDocument) => {
    let task = tasks.get(document)
    if (!task) { task = await staff!.prepareStaffMeasurementTask(document, {}, signal); tasks.set(document, task) }
    return task
  }
  return {
    cacheStats,
    seal(document: ScoreDocument) {
      sealed.add(document)
      if (numberedDocument === document) {
        numberedDocument = undefined
        numberedSettings.layoutTask = new NumberedLayoutTask()
      }
    },
    async measure(document: ScoreDocument, width: number, best?: WidthMeasurement | null): Promise<{ candidate: WidthMeasurement & { timings: WidthTimings }; prepared: PreparedBookScore }> {
      signal.throwIfAborted()
      if (!staff || !staffMeasure) {
        if (numberedDocument !== document) {
          numberedDocument = document
          numberedSettings.layoutTask = new NumberedLayoutTask()
        }
        const measured = measureNumberedWidth(document, width, { signal, auditLayout, settings: numberedSettings, maximumPageCount: best?.pageCount, minimumQuality: best ? numberedLayoutScore(best) : undefined })
        return { candidate: measured.candidate, prepared: deferredNumberedScore(document, { ...numberedSettings, layoutTask: undefined, width, pageMargin: 0 }, signal) }
      }
      const task = await staffTask(document)
      let render!: StaffRender
      const candidate = await staffMeasure.measureStaffWidth(document, width, { ...settings, interactive: false }, signal, { auditLayout, task, maximumPageCount: best?.pageCount, minimumQuality: best ? numberedLayoutScore(best) : undefined, onPrepared(value) { render = value } })
      if (candidate.pageCount === 1) candidate.naturalHeight = render.continuousHeight()
      const previous = winners.get(document)?.candidate
      if (!sealed.has(document) && !candidate.error && !candidate.outside?.length && !candidate.overlaps?.length
        && Number.isFinite(candidate.rows) && candidate.pageCount > 0
        && (!previous || candidate.pageCount < previous.pageCount || candidate.pageCount === previous.pageCount
          && (numberedLayoutScore(candidate) > numberedLayoutScore(previous)
            || numberedLayoutScore(candidate) === numberedLayoutScore(previous) && width < previous.width))) {
        const rows = cacheStats.retainedRows - (previous?.rows ?? 0) + candidate.rows
        cacheStats.retainedRows = rows; cacheStats.peakRows = Math.max(rows, cacheStats.peakRows)
        winners.set(document, { candidate, render })
      }
      return { candidate, prepared: deferredStaffScore(staff, document, task, width, settings, signal, take, cacheStats) }
    },
    async shared(scores: PreparedBookScore[], width: number, scoreGap: number) {
      if (!staff) return renderSharedPreparedNumberedNotationScores(scores.map(score => score.numbered!), scoreGap)
      const minimum = Math.max(...scores.map(score => scoreCoreGap(score.staff!.document, 'staff')))
      const capacity = a4SourcePageHeight(width)
      // Row engraving does not depend on the shared page's vertical gap.
      // Keep only this group's prepared rows while fitting scalar pagination.
      const pages = await Promise.all(scores.map(async score => {
        signal.throwIfAborted()
        const input = score.staff!
        return take(input.document, width) ?? staff.prepareStaffScore(input.document, { ...settings, width, coreGap: minimum, interactive: false }, signal, input.task)
      }))
      const height = (gap: number) => pages.reduce((sum, render) => sum + render.continuousHeight(gap), scoreGap * (pages.length - 1))
      const started = performance.now()
      if (height(minimum) > capacity) throw new Error('五线谱合页内容超出页面。')
      cacheStats.finalLayoutMs += performance.now() - started
      let lower = minimum, upper = scoreMaximumCoreGap(minimum)
      for (let i = 0; i < 8 && upper - lower > .1; i++) {
        await (globalThis.scheduler?.postTask?.(() => {}) ?? new Promise(resolve => setTimeout(resolve, 0)))
        signal.throwIfAborted()
        const gap = i === 0 ? upper : (lower + upper) / 2
        if (height(gap) <= capacity) { lower = gap; if (gap === upper) break }
        else upper = gap
      }
      const drawing = performance.now()
      const markup = pages.map(render => render(false, lower)[0]!)
      cacheStats.finalSvgMs += performance.now() - drawing
      return { markup, scoreGap: scoreGap + Math.max(0, capacity - height(lower)) / pages.length }
    },
  }
}
