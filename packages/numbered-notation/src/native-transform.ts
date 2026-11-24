import type { NativeInk } from './native-ink.js'
export type NativeMatrix = readonly [number, number, number, number, number, number]
/** SVG matrices used for fixed font symbols, including quarter turns. */
export function transformNativeInk(ink: NativeInk, [a,b,c,d,e,f]: NativeMatrix): NativeInk {
  const points = [[ink.left,ink.top],[ink.right,ink.top],[ink.left,ink.bottom],[ink.right,ink.bottom]]
    .map(([x,y]) => ({ x: a*x!+c*y!+e, y: b*x!+d*y!+f }))
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
    top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}
}
/** Preserve subpixel font scales; six decimals can move a 1000-em glyph edge. */
export const nativeMatrix = (...values: NativeMatrix): NativeMatrix => values.map(value=>Number(value.toFixed(12))) as unknown as NativeMatrix
