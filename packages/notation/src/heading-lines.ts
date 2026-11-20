type HeadingMeasurer = {
  measureText(text: string, style: { fontSize: number; fontFamily: string; fontWeight: number }): { w: number }
}

/** Shared header line-breaking policy; the renderers measure and paint their
 * own text blocks. Explicit newlines reset the available width for each line. */
export function numberedHeadingLines(
  text: string,
  width: number,
  size: number,
  measurer: HeadingMeasurer,
  weight = 400,
): string[] {
  const lines: string[] = []
  let line = ''
  const normalized = text.replace(/\r\n?/g, '\n')
  for (const character of normalized) {
    if (character === '\n') {
      lines.push(line.trimEnd())
      line = ''
      continue
    }
    if (
      line &&
      measurer.measureText(line + character, { fontSize: size, fontFamily: 'serif', fontWeight: weight }).w > width
    ) {
      const boundary = Math.max(line.lastIndexOf(' '), line.lastIndexOf('('), line.lastIndexOf('（'))
      if (boundary > line.length / 3) {
        lines.push(line.slice(0, boundary).trimEnd())
        line = line.slice(boundary + (line[boundary] === ' ' ? 1 : 0)) + character
      } else {
        lines.push(line.trimEnd())
        line = character.trimStart()
      }
    } else line += character
  }
  if (line || normalized.endsWith('\n')) lines.push(line.trimEnd())
  return lines
}
