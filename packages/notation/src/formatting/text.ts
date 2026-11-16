export function splitInlineComment(line: string) {
  let braceDepth = 0
  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index]
    if (character === '{') braceDepth += 1
    else if (character === '}' && braceDepth > 0) braceDepth -= 1
    else if (braceDepth === 0 && character === '/' && line[index + 1] === '/') {
      return { content: line.slice(0, index), comment: line.slice(index).trimEnd() }
    }
  }
  return { content: line, comment: '' }
}

export function appendComment(content: string, comment: string) {
  return comment ? `${content}${content ? '  ' : ''}${comment}` : content
}

/** Transform syntax outside brace values and comments; literal text is never music. */
export function mapLiteralSafe(source: string, transform: (value: string) => string, lyric = false) {
  const { content, comment } = splitInlineComment(source)
  const protectedPattern = lyric ? /(\{[^}]*\}|\([^)]*\))/g : /(\{[^}]*\})/g
  const value = content.split(protectedPattern).map((chunk, index) => index % 2 ? chunk : transform(chunk)).join('')
  return appendComment(value.trimEnd(), comment)
}

