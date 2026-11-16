import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'

/** Shared order rows use the same fonts, frame insets and cell gaps as paint.
 * A section label stays indivisible; only the boundary before it may wrap.
 */
export function numberedOrderLines(order: readonly string[] | undefined, available: number, measurer: TextMeasurer = new DefaultTextMeasurer(), fontSize = 16): string[][] {
  const text = (value: string, weight = 400) => measurer.measureText(value, { fontSize, fontFamily: 'serif', fontWeight: weight }).w
  const gap = fontSize * 0.25, frameInset = fontSize * (3.5 / 16)
  const arrow = text('→'), continuation = arrow + gap
  const lines: string[][] = []
  let line: string[] = [], used = text('演奏顺序：') + gap
  for (const name of order?.filter(Boolean) ?? []) {
    const framed = text(name, 700) + frameInset * 2
    const addition = framed + (line.length ? arrow + gap * 2 : 0)
    if (used + addition > available + 1e-6 && line.length) {
      lines.push(line); line = []; used = continuation
    }
    used += framed + (line.length ? arrow + gap * 2 : 0)
    line.push(name)
  }
  if (line.length) lines.push(line)
  return lines
}
