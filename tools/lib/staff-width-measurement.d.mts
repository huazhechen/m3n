import type { StaffMeasurementTask, prepareStaffScore } from '@m3n/score-renderer/staff'
import type { ScoreDocument } from '@m3n/notation'
import type { WidthMeasurement } from '../scorebook-width.mjs'
export function measureStaffWidth(score: ScoreDocument, width: number, settings?: { transpose?: number; tempoScale?: number; measureNumbers?: boolean; includeBass?: boolean; pageMargin?: number; coreGap?: number }, signal?: AbortSignal, options?: { auditLayout?: boolean; task?: StaffMeasurementTask; onPrepared?: (render: Awaited<ReturnType<typeof prepareStaffScore>>) => void }): Promise<WidthMeasurement & { timings: Record<string, number> }>
