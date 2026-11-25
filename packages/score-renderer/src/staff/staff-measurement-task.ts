import { prepareNumberedNotationFonts } from '@m3n/numbered-notation'
import type { ScoreDocument } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasureMinimum } from './line-layout.js'
import { textMeasurer } from './layout-svg.js'
import { createStaffPreparation } from './staff-engine.js'

type ProjectionSettings = { transpose?: number; includeBass?: boolean; tempoScale?: number }
/** Created after font preparation for one immutable score and one selection task. */
export async function prepareStaffMeasurementTask(score: ScoreDocument, settings: ProjectionSettings = {}, signal?: AbortSignal) {
  await prepareNumberedNotationFonts(score)
  signal?.throwIfAborted()
  const transpose = settings.transpose ?? 0, includeBass = settings.includeBass ?? true, tempoScale = settings.tempoScale ?? 1
  const document = projectStaffDocument(score, settings.transpose, settings.includeBass)
  document.measures = document.measures.map(m => ({ ...m, tempo: m.tempo * tempoScale }))
  const measure = textMeasurer()
  const preparation = createStaffPreparation()
  const minimum = createStaffMeasureMinimum(document.hasBass, measure, preparation)
  return {
    document, measure, preparation, minimum,
    assertCompatible(candidate: ScoreDocument, next: ProjectionSettings) {
      if (candidate !== score || (next.transpose ?? 0) !== transpose || (next.includeBass ?? true) !== includeBass || (next.tempoScale ?? 1) !== tempoScale)
        throw new Error('五线谱测量任务不能跨乐谱或排版设置复用。')
    },
  }
}
export type StaffMeasurementTask = Awaited<ReturnType<typeof prepareStaffMeasurementTask>>
