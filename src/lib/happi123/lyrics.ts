const HAN_CHARACTER = /[\u3400-\u9fff]/
const PUNCTUATION = /^[，。！？、；：,.!?;:）】》”’…]+/

export function convertHappiLyrics(source: string) {
  const tokens: string[] = []
  let index = 0

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      index += whitespace[0].length
      continue
    }
    if (rest[0] === '_' ) {
      tokens.push('%')
      index += 1
      continue
    }
    if (rest[0] === '/') {
      index += 1
      continue
    }
    if (HAN_CHARACTER.test(rest[0])) {
      tokens.push(rest[0])
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
      tokens.push(word[0])
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
