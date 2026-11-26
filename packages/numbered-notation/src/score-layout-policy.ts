import { scoreLayoutConfig } from './score-layout-config.js'

/** Source leading is measured in the shared notation unit, never a font's
 * implementation em (SMuFL em and digit em describe different things). */
export function scoreCoreGap(score?: { coreGapEm?: number }): number {
  return scoreLayoutConfig.numbered.music * (score?.coreGapEm ?? scoreLayoutConfig.numbered.coreGapEm)
}
export const scoreMaximumCoreGap = (minimum: number): number => minimum * 1.1
export const scoreLyricGapScale = (minimum: number): number => minimum > 0
  ? Math.min(1, scoreLayoutConfig.numbered.music * .8 / minimum) : 1

/** Lyrics start closer, but share the ordinary page stretch ceiling. */
export function interpolateScoreCoreGap(minimum: number, maximum: number, current: number, scale = 1): number {
  const start = minimum * scale
  return start === minimum ? current : maximum > minimum
    ? start + (current - minimum) / (maximum - minimum) * (maximum - start) : start
}

/** Navigation symbols share actual ink height across notation engines. */
export const scoreNavigationGlyphHeight = (): number => scoreLayoutConfig.numbered.music * .8

/** Actual ink heights for decorations with matching glyph semantics. */
const attachmentRatios: Readonly<Record<string, number>> = { str: .25, breath: .4, fermata: .3, tr: .5, prall: .275, hold: .05, brk: .3 }
export function scoreAttachmentHeight(name: string): number | undefined {
  const ratio = attachmentRatios[name]
  return ratio === undefined ? undefined : scoreLayoutConfig.numbered.music * ratio
}

/** Duration springs use quarter-note units in both notation engines. */
export function scoreRhythmicWeight(duration: number): number {
  return Math.sqrt(Math.max(.01, duration))
}

/** The most frequent per-measure shortest duration, capped at an eighth.
 * Quantization only stabilizes equivalent tuplet arithmetic. Ties favor the
 * shorter duration so input/voice ordering cannot change the result. */
export function scoreSpacingBasis(measures: readonly (readonly number[])[]): number {
  const counts = new Map<number, number>()
  for (const durations of measures) {
    const positive = durations.filter(duration => Number.isFinite(duration) && duration > 0)
    if (!positive.length) continue
    const duration = Math.round(Math.min(...positive) * 1e8) / 1e8
    counts.set(duration, (counts.get(duration) ?? 0) + 1)
  }
  let basis = .5, most = 0
  for (const [duration, count] of counts) if (count > most || count === most && duration < basis) {
    basis = duration; most = count
  }
  return Math.min(.5, basis)
}

/** LilyPond-style duration spacing: one head plus one increment at the
 * reference duration, then one increment per doubling. Shorter values shrink
 * only the following space; the physical head keeps its measured width. */
export function scoreNaturalAdvance(duration: number, basis: number, headWidth: number, increment: number): number {
  if (![duration, basis].every(value => Number.isFinite(value) && value > 0)
    || ![headWidth, increment].every(value => Number.isFinite(value) && value >= 0)) throw new Error('自然间距参数无效。')
  const ratio = duration / basis
  return headWidth + increment * (ratio < 1 ? ratio : 1 + Math.log2(ratio))
}
