const HAN_CHARACTER = /[\u3400-\u9fff]/
const PUNCTUATION = /^[，。！？、；：,.!?;:）】》”’…]+/

export function convertHappiLyrics(source: string) {
  const tokens: string[] = []
  let index = 0
  let forceTiedTarget = false

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      index += whitespace[0].length
      continue
    }
    if (rest[0] === '+') {
      forceTiedTarget = true
      index += 1
      continue
    }
    if (rest[0] === '(') {
      const end = rest.indexOf(')')
      if (end > 1) {
        tokens.push(`${forceTiedTarget ? '+' : ''}(${rest.slice(1, end)})`)
        forceTiedTarget = false
        index += end + 1
        continue
      }
    }
    if (rest[0] === '_' ) {
      tokens.push('%')
      index += 1
      continue
    }
    if (rest[0] === '/') {
      // The Happi123 corpus uses slash runs as explicit lyric alignment
      // placeholders.  Dropping them shifts every following syllable.
      tokens.push('%')
      index += 1
      continue
    }
    if (rest[0] === ';') {
      tokens.push('%')
      index += 1
      continue
    }
    if (HAN_CHARACTER.test(rest[0])) {
      tokens.push(`${forceTiedTarget ? '+' : ''}${rest[0]}`)
      forceTiedTarget = false
      index += 1
      continue
    }
    const punctuation = PUNCTUATION.exec(rest)
    if (punctuation) {
      if (tokens.length > 0) {
        tokens[tokens.length - 1] += punctuation[0]
      }
      index += punctuation[0].length
      continue
    }
    const word = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*-?/.exec(rest)
    if (word) {
      tokens.push(`${forceTiedTarget ? '+' : ''}${word[0]}`)
      forceTiedTarget = false
      index += word[0].length
      continue
    }

    if (tokens.length > 0) {
      tokens[tokens.length - 1] += rest[0]
    } else {
      tokens.push(rest[0])
    }
    index += 1
  }

  return tokens.join(' ')
}
