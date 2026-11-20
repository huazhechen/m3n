import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export function nativeArticulationSvg(name: string, size?: number): string | undefined {
  if (name === 'str') return bravuraSvg('articAccentAbove', (size ?? nativeStyle.small) * .5)
  if (name === 'breath') return bravuraSvg('breathMarkComma', size ?? nativeStyle.music * (10 / 22))
  return undefined
}
