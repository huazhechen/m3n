import { scoreLayoutConfig } from '../score-layout-config.js'

/** Source leading is a dimensionless multiplier of each notation's base gap. */
export function scoreCoreGap(score?: { coreGapEm?: number }, notation: 'numbered' | 'staff' = 'numbered'): number {
  const base = notation === 'staff'
    ? scoreLayoutConfig.staff.music / 4 * scoreLayoutConfig.staff.coreGapSpaces
    : scoreLayoutConfig.numbered.music * scoreLayoutConfig.numbered.coreGapEm
  return base * (score?.coreGapEm ?? 1)
}
/** Local attachment clearance follows the score baseline, not page stretching. */
export const scoreAttachmentGap = (score?: { coreGapEm?: number }, notation: 'numbered' | 'staff' = 'numbered'): number =>
  scoreCoreGap(score, notation) * scoreLayoutConfig.page.attachmentGapRatio

/** Header spacing is based on the source gap and never stretched per page. */
export const scoreHeaderGap = (minimum: number): number => minimum * .8
/** Inline section starts replace the ordinary core gap; no additive spacer. */
export const scoreSectionCoreGap = (notation: 'numbered' | 'staff' = 'numbered'): number =>
  scoreLayoutConfig[notation].music * 1.5

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

/** Duration springs use quarter-note units; adapters choose their duration power. */
export function scoreRhythmicWeight(duration: number, durationPower = .5): number {
  return Math.max(.01, duration) ** durationPower
}

/** Directed pair clearance: quarter = 1; zero-time structural items = quarter.
 * The left onset owns 75% of the rhythmic signal, the right owns 25%.
 * Numbered notation uses power 1; staff keeps the default square root.
 * Ink reservations stay independent of this minimum/stretch weight. */
export function scoreRhythmicGapWeight(left?: number, right?: number, groupRatio = 1, durationPower = .5): number {
  const a = scoreRhythmicWeight(left && left > 0 ? left : 1, durationPower)
  const b = scoreRhythmicWeight(right && right > 0 ? right : 1, durationPower)
  return a ** .75 * b ** .25 * groupRatio
}
