import type { ScoreDocument } from '@m3n/notation'
import { scoreCoreGap, scoreMaximumCoreGap, NumberedTextMeasurementCache, NumberedLayoutTask, renderSharedPreparedNumberedNotationScores, PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { a4SourcePageHeight } from '@m3n/score-renderer/view'
import type { prepareStaffScore, StaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureNumberedWidth, type WidthTimings } from '../../tools/lib/numbered-width-measurement.mjs'
import type { WidthMeasurement } from '../../tools/scorebook-width.mjs'
import type { NotationMode } from './renderer-settings'

export type ScorebookDisplaySettings = { notationMode: NotationMode; measureNumbers: boolean }
type StaffRender = Awaited<ReturnType<typeof prepareStaffScore>>
export type PreparedBookScore = {
  renderPaged(): string[] | Promise<string[]>
  numbered?: PreparedNumberedNotationScore
  staff?: { document: ScoreDocument; task: StaffMeasurementTask }
}

// Keep this closure separate from measure(): no measured render/layout may be
// retained by the returned candidate. A whole book has thousands of candidates.
function deferredStaffScore(staff: typeof import('@m3n/score-renderer/staff'), document: ScoreDocument,
  task: StaffMeasurementTask, width: number, settings: ScorebookDisplaySettings, signal: AbortSignal): PreparedBookScore {
  return {
    staff: { document, task },
    async renderPaged() {
      signal.throwIfAborted()
      const render = await staff.prepareStaffScore(document, { ...settings, width }, signal, task)
      return render(true).map(svg => svg.outerHTML)
    },
  }
}

// Retain the immutable inputs, not every candidate's placed rows. Rebuild only
// the widths selected by chapter packing, using the same task/font preparation.
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
  const numberedSettings = { fixedDo: settings.notationMode === 'fixed', measureNumbers: settings.measureNumbers,
    textMeasurementCache: new NumberedTextMeasurementCache(), layoutTask: new NumberedLayoutTask() }
  const staff = settings.notationMode === 'staff' ? await import('@m3n/score-renderer/staff') : undefined
  const staffMeasure = staff ? await import('../../tools/lib/staff-width-measurement.mjs') : undefined
  const tasks = new Map<ScoreDocument, StaffMeasurementTask>()
  return {
    async measure(document: ScoreDocument, width: number): Promise<{ candidate: WidthMeasurement & { timings: WidthTimings }; prepared: PreparedBookScore }> {
      signal.throwIfAborted()
      if (!staff || !staffMeasure) {
        const measured = measureNumberedWidth(document, width, { signal, auditLayout, settings: numberedSettings })
        return { candidate: measured.candidate, prepared: deferredNumberedScore(document, { ...numberedSettings, width, pageMargin: 0 }, signal) }
      }
      let task = tasks.get(document)
      if (!task) { task = await staff.prepareStaffMeasurementTask(document, {}, signal); tasks.set(document, task) }
      let render!: StaffRender
      const candidate = await staffMeasure.measureStaffWidth(document, width, settings, signal, { auditLayout, task, onPrepared(value) { render = value } })
      if (candidate.pageCount === 1) candidate.naturalHeight = render.continuousHeight()
      return { candidate, prepared: deferredStaffScore(staff, document, task, width, settings, signal) }
    },
    async shared(scores: PreparedBookScore[], width: number, scoreGap: number) {
      if (!staff) return renderSharedPreparedNumberedNotationScores(scores.map(score => score.numbered!), scoreGap)
      const minimum = Math.max(...scores.map(score => scoreCoreGap(score.staff!.document)))
      const capacity = a4SourcePageHeight(width)
      // Row engraving does not depend on the shared page's vertical gap.
      // Keep only this group's prepared rows while fitting scalar pagination.
      const pages = await Promise.all(scores.map(async score => {
        signal.throwIfAborted()
        const input = score.staff!
        return staff.prepareStaffScore(input.document, { ...settings, width, coreGap: minimum }, signal, input.task)
      }))
      const height = (gap: number) => pages.reduce((sum, render) => sum + render.continuousHeight(gap), scoreGap * (pages.length - 1))
      if (height(minimum) > capacity) throw new Error('五线谱合页内容超出页面。')
      let lower = minimum, upper = scoreMaximumCoreGap(minimum)
      for (let i = 0; i < 8 && upper - lower > .1; i++) {
        await (globalThis.scheduler?.postTask?.(() => {}) ?? new Promise(resolve => setTimeout(resolve, 0)))
        signal.throwIfAborted()
        const gap = i === 0 ? upper : (lower + upper) / 2
        if (height(gap) <= capacity) { lower = gap; if (gap === upper) break }
        else upper = gap
      }
      return { markup: pages.map(render => render(false, lower)[0]!.outerHTML), scoreGap: scoreGap + Math.max(0, capacity - height(lower)) / pages.length }
    },
  }
}
