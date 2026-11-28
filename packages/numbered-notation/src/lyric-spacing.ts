import { scoreLayoutConfig } from './score-layout-config.js'

/** Shared lyric settings live in the central layout configuration. */
export const lyricSpacing = scoreLayoutConfig.lyrics

/** Use the matching music tier. Custom spacings retain the highest tier
 * they have reached, clamped to the configured three lyric gaps. */
export function lyricPairGap(spacing: number, musicTiers: readonly number[]): number {
  let tier = 0
  for (let index = 1; index < musicTiers.length; index++) if (spacing >= musicTiers[index]!) tier = index
  return lyricSpacing.pairGaps[Math.min(tier, lyricSpacing.pairGaps.length - 1)]!
}

/** Source adjacency distinguishes syllables of one word from nearby words,
 * verses and repeated visits without guessing from the rendered text. */
export type LyricWordSyllable = { wordpos?: 'i' | 'm' | 't'; sourceStart: number; sourceEnd: number }
export const hasLyricHyphen = (word?: LyricWordSyllable) => word?.wordpos === 'i' || word?.wordpos === 'm'
export const connectsLyricWord = (word: LyricWordSyllable | undefined, next: LyricWordSyllable | undefined) =>
  hasLyricHyphen(word) && (next?.wordpos === 'm' || next?.wordpos === 't') && word!.sourceEnd + 1 === next.sourceStart

export function lyricHyphenMetrics(size: number) {
  return { width: size * .25, gap: size * .1, stroke: size * .055, rise: size * .28 }
}
/** A single centred dash, with a short trailing dash at a system boundary.
 * Horizontal minima reserve this trailing extent, including round stroke caps. */
export function lyricHyphenGeometry(right: number, baseline: number, size: number, nextLeft?: number) {
  const { width, gap, stroke, rise } = lyricHyphenMetrics(size)
  const start = nextLeft === undefined ? right + gap + stroke / 2 : (right + nextLeft - width) / 2
  return { left: start, right: start + width, y: baseline - rise, stroke }
}
export const lyricHyphenAdvance = (size: number) => {
  const { width, gap, stroke } = lyricHyphenMetrics(size)
  return gap + width + stroke
}
