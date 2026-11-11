import type { Font } from 'opentype.js'

/** Avoid opentype.js 2's exponential-notation rounding bug near integer coordinates. */
export function glyphPathData(font: Font, char: string, x: number, y: number, size: number): string {
  const path = font.getPath(char, x, y, size)
  for (const command of path.commands) {
    for (const [key, value] of Object.entries(command)) {
      if (typeof value === 'number') Object.assign(command, { [key]: Math.round(value * 1000) / 1000 })
    }
  }
  const data = path.toPathData(3)
  if (/NaN|Infinity/.test(data)) throw new Error('字形轮廓包含无效坐标，无法完整导出。')
  return data
}
