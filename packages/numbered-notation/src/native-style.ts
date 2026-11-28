import { scoreCoreGap, scoreHeaderGap } from './layout/policy.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { scoreLayoutConfig } from './score-layout-config.js'

/** Internal shorthand; edit score-layout-config.ts to change engraving settings. */
export const nativeStyle = scoreLayoutConfig.numbered

/** Base vertical clearance in score px; configured in em of the music font. */
export const nativeCoreGap = () => scoreCoreGap()

export const nativeHeaderGap = () => scoreHeaderGap(nativeCoreGap())

/** Shared attachment clearance, also used between music and lyric tiers. */
export const nativeAttachmentGap = (_coreGap = nativeCoreGap()) => nativeStyle.music / scoreLayoutConfig.page.attachmentGapDivisor

export function nativeDesignPath(d: string): string {
  return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, value => String(n(Number(value))))
}
