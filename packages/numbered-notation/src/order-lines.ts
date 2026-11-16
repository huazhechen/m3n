/** Published order-line grouping, shared by both rendering projections. */
export function numberedOrderLines(order: readonly string[] | undefined, available: number): string[][] {
  const lines: string[][] = []
  let line: string[] = [], used = 100
  for (const name of order?.filter(Boolean) ?? []) {
    const labelWidth = [...name].reduce((sum, char) => sum + (char.codePointAt(0)! > 127 ? 16 : 12), 0)
    const addition = labelWidth + 11 + (line.length ? 24 : 0)
    if (used + addition > available && line.length) { lines.push(line); line = []; used = 24 }
    line.push(name); used += addition
  }
  if (line.length) lines.push(line)
  return lines
}
