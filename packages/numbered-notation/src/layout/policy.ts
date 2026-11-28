import { scoreLayoutConfig } from '../score-layout-config.js'

/** Fixed internal engraving baseline; independent of elastic row spacing. */
export function scoreCoreGap(notation: 'numbered' | 'staff' = 'numbered'): number {
  const base = notation === 'staff'
    ? scoreLayoutConfig.staff.music / 4 * scoreLayoutConfig.staff.coreGapSpaces
    : scoreLayoutConfig.numbered.music * scoreLayoutConfig.numbered.coreGapEm
  return base
}
/** Local clearance follows music size, independent of page stretching. */
export const scoreAttachmentGap = (notation: 'numbered' | 'staff' = 'numbered'): number =>
  scoreLayoutConfig[notation].music / scoreLayoutConfig.page.attachmentGapDivisor

/** Header spacing uses the fixed engraving baseline and never stretches per page. */
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

/** Duration springs use quarter-note units in both notation engines. */
export function scoreRhythmicWeight(duration: number): number {
  return Math.sqrt(Math.max(.01, duration))
}

/** Directed pair clearance: quarter = 1; zero-time structural items = quarter.
 * The left share defaults to 75%; notation adapters may request equal shares.
 * Ink reservations stay independent of this minimum/stretch weight. */
export function scoreRhythmicGapWeight(left?: number, right?: number, groupRatio = 1, leftShare = .75): number {
  const a = scoreRhythmicWeight(left && left > 0 ? left : 1)
  const b = scoreRhythmicWeight(right && right > 0 ? right : 1)
  return a ** leftShare * b ** (1 - leftShare) * groupRatio
}

/** Inter-system policy only: measured music, lyrics, headers and attachments
 * retain their measured geometry. Both notations use their music em. */
export type ScoreVerticalSpacing = { minimum: number; comfortable: number; maximum: number }
export function scoreVerticalSpacing(notation: 'numbered' | 'staff' = 'numbered'): ScoreVerticalSpacing {
  const minimum = scoreLayoutConfig[notation].music * scoreLayoutConfig[notation].minimumRowGapEm
  return { minimum, comfortable: minimum * 1.5, maximum: minimum * 2 }
}
export function scoreVerticalCost(gap: number, spacing: ScoreVerticalSpacing): number {
  if (spacing.maximum <= spacing.minimum) return 0
  return Math.max(0, (spacing.comfortable - gap) / (spacing.comfortable - spacing.minimum)) ** 2
}

/** Explicit pixel overrides still use the same row and collision policy. */
export function scoreFixedVerticalSpacing(gap: number): ScoreVerticalSpacing {
  return { minimum: gap, comfortable: gap, maximum: gap }
}
