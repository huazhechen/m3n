import { nativeStyle } from './native-style.js'
import { nativePathInk } from './native-ink.js'

// Project contours, independent of the reference layout and runtime.
const contours = {
  str: { d: 'M0.21413 0.4818 L8.21413 3.72071 L0.29494 6.92724', weight: .5, size: nativeStyle.small, stroke: 1 },
  breath: { d: 'M4 0 C7 2 3 7 0 8 C2 5 3 2 4 0 Z', weight: 1, size: nativeStyle.music * (10/22), stroke: 0 },
} as const

export function nativeArticulationSvg(name: string, size?: number): string | undefined {
  if (name !== 'str' && name !== 'breath') return undefined
  const shape=contours[name], box=nativePathInk(shape.d), scale=(size??shape.size)*shape.weight/(box.bottom-box.top)
  const center=(box.left+box.right)/2, n=(value:number)=>Number(value.toFixed(6))
  let coordinate=0
  const d=shape.d.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g,token=>{
    if (/^[MLCZ]$/.test(token)) {coordinate=0;return token}
    return String(n((Number(token)-(coordinate++%2?box.top:center))*scale))
  })
  return shape.stroke ? `<path d="${d}" fill="none" stroke="#000" stroke-width="${n(shape.stroke*scale)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${d}" fill="#000"/>`
}
