import { scoreAttachmentHeight } from './layout/policy.js'
import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
export function nativeArticulationSvg(name: string, size?: number, measurer?: TextMeasurer): string | undefined {
  if (name === 'str') return bravuraSvg('articAccentAbove', size === undefined ? scoreAttachmentHeight('str')! : size * .5, measurer)
  if (name === 'breath') return bravuraSvg('breathMarkComma', size ?? scoreAttachmentHeight('breath')!, measurer)
  return undefined
}
