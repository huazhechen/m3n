/** Pretty-prints a single-line MEI document with two-space indentation. */
export function formatMeiXml(xml: string) {
  const tokens = xml
    .replace(/></g, '>\n<')
    .split('\n')
    .map((token) => token.trim())
    .filter(Boolean)
  const lines: string[] = []
  let depth = 0
  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!')) {
      lines.push(token)
      continue
    }
    if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      lines.push(`${'  '.repeat(depth)}${token}`)
      continue
    }
    if (/^<[^!?][^>]*\/>$/.test(token)) {
      lines.push(`${'  '.repeat(depth)}${token}`)
      continue
    }
    if (/^<[^!?][^>]*>$/.test(token) && !token.includes('</')) {
      lines.push(`${'  '.repeat(depth)}${token}`)
      depth += 1
      continue
    }
    lines.push(`${'  '.repeat(depth)}${token}`)
  }
  return lines.join('\n')
}
