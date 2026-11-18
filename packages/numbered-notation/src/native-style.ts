import { nativeSvgNumber as n } from './native-svg-number.js'
/** One engraving scale. Ratios below are design choices, never occupied bounds.
 * Text and symbol ink is measured separately. Page dimensions are independent.
 */
const music = 22
export const nativeStyle = {
  music,
  text: music * (16 / 22),
  annotation: music * (14 / 22),
  lyric: music * (16 / 22),
  lyricTopGap: music * (6 / 22),
  lyricGap: music * (4 / 22),
  grace: music * (13 / 22),
  graceNote: music * 0.7,
  meter: music * (18 / 22),
  title: music * (32 / 22),
  subtitle: music * (16 / 22),
  credit: music * (14 / 22),
  small: music * (12 / 22),
  repeatCount: music * (13 / 22),
  measureNumber: music * (10 / 22),
  stroke: music * (1.3 / 22),
  symbolStroke: music * (1.2 / 22),
  markGap: music * 0.12,
  laneGap: music * 0.9375,
  systemGap: music * (24 / 22),
}

/** Convert a symbol's authored 22-unit grid into the current music scale. */
export const nativeEm = (units: number) => units * (nativeStyle.music / 22)
export function nativeDesignPath(d: string): string {
  return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, value => String(n(nativeEm(Number(value)))))
}
