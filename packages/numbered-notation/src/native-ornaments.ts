import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export function nativeOrnamentSvg(name: string, size = nativeStyle.small): string | undefined {
  if (name === 'tr') return bravuraSvg('ornamentTrill', size)
  if (name === 'prall') return bravuraSvg('ornamentShortTrill', size * .55)
  return undefined
}
