import { scoreLayoutConfig } from '../score-layout-config.js'

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

/** Directed pair clearance: quarter = 1; zero-time structural items = quarter.
 * The left onset owns 75% of the rhythmic signal, the right owns 25%.
 * Ink reservations stay independent of this minimum/stretch weight. */
export function scoreRhythmicGapWeight(left?: number, right?: number, groupRatio = 1): number {
  const a = scoreRhythmicWeight(left && left > 0 ? left : 1)
  const b = scoreRhythmicWeight(right && right > 0 ? right : 1)
  return a ** .75 * b ** .25 * groupRatio
}
