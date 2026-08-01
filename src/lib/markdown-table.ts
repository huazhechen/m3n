function isTableDelimiter(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function escapePipesInInlineCode(line: string) {
  let delimiterLength = 0
  let escaped = ''

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '`') {
      const match = /^`+/.exec(line.slice(index))?.[0] ?? ''
      const length = match.length
      if (delimiterLength === 0) {
        delimiterLength = length
      } else if (length === delimiterLength) {
        delimiterLength = 0
      }
      escaped += match
      index += length - 1
      continue
    }
    if (line[index] === '|' && delimiterLength > 0 && line[index - 1] !== '\\') {
      escaped += '\\'
    }
    escaped += line[index]
  }

  return escaped
}

export function escapeTableCodePipes(markdown: string) {
  const lines = markdown.split('\n')
  let inFence = false
  let inTable = false

  return lines.map((line, index) => {
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      inTable = false
      return line
    }
    if (inFence) return line

    const isTableRow = line.includes('|')
    if (isTableDelimiter(lines[index + 1] ?? '')) inTable = true
    if (!inTable || !isTableRow) {
      if (!isTableRow) inTable = false
      return line
    }
    return escapePipesInInlineCode(line)
  }).join('\n')
}
