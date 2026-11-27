import { scoreAttachmentHeight } from './layout/policy.js'
import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
export function nativeOrnamentSvg(name: string, size?: number, measurer?: TextMeasurer): string | undefined {
  if (name === 'tr') return bravuraSvg('ornamentTrill', size ?? scoreAttachmentHeight('tr')!, measurer)
  if (name === 'prall') return bravuraSvg('ornamentShortTrill', size === undefined ? scoreAttachmentHeight('prall')! : size * .55, measurer)
  return undefined
}
