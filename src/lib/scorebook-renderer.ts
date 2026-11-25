import type { ScoreDocument } from '@m3n/notation'
import { scoreLayoutConfig, NumberedTextMeasurementCache, NumberedLayoutTask, renderSharedPreparedNumberedNotationScores, type PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { a4SourcePageHeight } from '@m3n/score-renderer/view'
import type { prepareStaffScore, StaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureNumberedWidth, type WidthTimings } from '../../tools/lib/numbered-width-measurement.mjs'
import type { WidthMeasurement } from '../../tools/scorebook-width.mjs'
import type { NotationMode } from './renderer-settings'

export type ScorebookDisplaySettings = { notationMode: NotationMode; measureNumbers: boolean }
type StaffRender = Awaited<ReturnType<typeof prepareStaffScore>>
export type PreparedBookScore = {
  renderPaged(): string[]
  numbered?: PreparedNumberedNotationScore
  staff?: { document: ScoreDocument; task: StaffMeasurementTask; render: StaffRender }
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
        return { candidate: measured.candidate, prepared: { numbered: measured.prepared, renderPaged: () => measured.prepared.renderPaged() } }
      }
      let task = tasks.get(document)
      if (!task) { task = await staff.prepareStaffMeasurementTask(document, {}, signal); tasks.set(document, task) }
      let render!: StaffRender
      const candidate = await staffMeasure.measureStaffWidth(document, width, settings, signal, { auditLayout, task, onPrepared(value) { render = value } })
      if (candidate.pageCount === 1) candidate.naturalHeight = render.continuousHeight()
      return { candidate, prepared: { staff: { document, task, render }, renderPaged: () => render(true).map(svg => svg.outerHTML) } }
    },
    async shared(scores: PreparedBookScore[], width: number, scoreGap: number) {
      if (!staff) return renderSharedPreparedNumberedNotationScores(scores.map(score => score.numbered!), scoreGap)
      const minimum = Math.max(...scores.map(score => (score.staff!.document.minimumCoreGap ?? scoreLayoutConfig.staff.minimumCoreGap)))
      const capacity = a4SourcePageHeight(width)
      const renderAt = async (coreGap: number) => Promise.all(scores.map(async score => {
        signal.throwIfAborted()
        const input = score.staff!
        const render = await staff.prepareStaffScore(input.document, { ...settings, width, coreGap }, signal, input.task)
        return render
      }))
      const height = (pages: StaffRender[]) => pages.reduce((sum, render) => sum + render.continuousHeight(), scoreGap * (pages.length - 1))
      let pages = await renderAt(minimum)
      if (height(pages) > capacity) throw new Error('五线谱合页内容超出页面。')
      let lower = minimum, upper = Math.max(32, minimum)
      for (let i = 0; i < 8 && upper - lower > .1; i++) {
        await new Promise(resolve => setTimeout(resolve, 0))
        const gap = i === 0 ? upper : (lower + upper) / 2
        const candidate = await renderAt(gap)
        if (height(candidate) <= capacity) { lower = gap; pages = candidate; if (gap === upper) break }
        else upper = gap
      }
      return { markup: pages.map(render => render(false)[0]!.outerHTML), scoreGap: scoreGap + Math.max(0, capacity - height(pages)) / pages.length }
    },
  }
}
