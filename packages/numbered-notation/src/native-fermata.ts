import { scoreAttachmentHeight } from './layout/policy.js'
import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
export const nativeFermataSvg = (size?: number, measurer?: TextMeasurer) => bravuraSvg('fermataAbove', size === undefined ? scoreAttachmentHeight('fermata')! : size * .6, measurer)
