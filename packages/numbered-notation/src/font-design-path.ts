import type { Glyph, Path } from '@pdf-lib/fontkit'
import { nativePathInk } from './native-ink.js'

type OutlinePath = Path & { commands: { command: string; args: number[] }[] }
const bounds = new WeakMap<Path, Map<number, ReturnType<typeof nativePathInk>>>()
const commands: Record<string, string> = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }
const glyphPaths = new WeakMap<Glyph, Path>()
type ContourPoint = { x: number; y: number; onCurve: boolean }

/** fontkit 1.1.1 inserts an extra quadratic segment when a TrueType contour
 * starts off-curve. Decode its original points with the TrueType implied-point
 * rule instead. Screen metrics and PNG outlines consume this same path. */
export function fontDesignGlyphPath(glyph: Glyph): Path {
  const saved = glyphPaths.get(glyph)
  if (saved) return saved
  const contours = (glyph as Glyph & { _getContours?: () => ContourPoint[][] })._getContours?.()
  if (!contours) return glyph.path
  const path = new (glyph.path.constructor as new () => Path)()
  for (const contour of contours) {
    if (!contour.length) continue
    const firstOnCurve = contour.findIndex(point => point.onCurve)
    const first = contour[0]!, last = contour.at(-1)!
    const start = firstOnCurve >= 0 ? contour[firstOnCurve]! : { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
    const points = firstOnCurve >= 0 ? [...contour.slice(firstOnCurve + 1), ...contour.slice(0, firstOnCurve)] : contour
    path.moveTo(start.x, start.y)
    let control: ContourPoint | undefined
    for (const point of points) {
      if (point.onCurve) {
        if (control) path.quadraticCurveTo(control.x, control.y, point.x, point.y)
        else path.lineTo(point.x, point.y)
        control = undefined
      } else {
        if (control) path.quadraticCurveTo(control.x, control.y, (control.x + point.x) / 2, (control.y + point.y) / 2)
        control = point
      }
    }
    if (control) path.quadraticCurveTo(control.x, control.y, start.x, start.y)
    path.closePath()
  }
  glyphPaths.set(glyph, path)
  return path
}

/** Keep quadratic curves quadratic: fontkit's bbox converts them to cubics,
 * whose near-zero derivative coefficients can lose precision. Reuse the
 * engine's exact polynomial extrema, without toSVG's two-decimal rounding. */
export function fontDesignPathInk(path: Path, shear = 0) {
  let variants = bounds.get(path)
  const saved = variants?.get(shear)
  if (saved) return saved
  const source = (path as OutlinePath).commands
  if (!source.length) return undefined
  const d = source.map(({ command, args }) => {
    const op = commands[command]
    if (!op) throw new Error(`Unsupported font outline command: ${command}`)
    return op + args.map((value, index) => index % 2 === 0 ? value + shear * args[index + 1]! : value).join(' ')
  }).join('')
  const ink = Object.freeze(nativePathInk(d))
  if (!variants) { variants = new Map(); bounds.set(path, variants) }
  variants.set(shear, ink)
  return ink
}
