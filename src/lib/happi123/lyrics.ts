const HAN_CHARACTER = /[\u3400-\u9fff]/
const PUNCTUATION = /^[，。！？、；：,.!?;:）】》”’…]+/

export type HappiLyricItem = {
  value: string
  placeholder: boolean
}

export function convertHappiLyricItems(source: string) {
  const items: HappiLyricItem[] = []
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
    if (rest.startsWith('()')) {
      items.push({ value: '%', placeholder: true })
      index += 2
      continue
    }
    const countedPlaceholder = /^\{\/([1-9]\d*)\}/.exec(rest)
    if (countedPlaceholder) {
      items.push({ value: `%{${countedPlaceholder[1]}}`, placeholder: true })
      index += countedPlaceholder[0].length
      continue
    }
    if (rest[0] === '(') {
      const end = rest.indexOf(')')
      if (end > 1) {
        items.push({ value: `${forceTiedTarget ? '+' : ''}(${rest.slice(1, end)})`, placeholder: false })
        forceTiedTarget = false
        index += end + 1
        continue
      }
    }
    if (rest[0] === '_' ) {
      items.push({ value: '%', placeholder: true })
      index += 1
      continue
    }
    if (rest[0] === '/') {
      // The Happi123 corpus uses slash runs as explicit lyric alignment
      // placeholders.  Dropping them shifts every following syllable.
      items.push({ value: '%', placeholder: true })
      index += 1
      continue
    }
    if (rest[0] === ';') {
      items.push({ value: '%', placeholder: true })
      index += 1
      continue
    }
    if (HAN_CHARACTER.test(rest[0])) {
      items.push({ value: `${forceTiedTarget ? '+' : ''}${rest[0]}`, placeholder: false })
      forceTiedTarget = false
      index += 1
      continue
    }
    const punctuation = PUNCTUATION.exec(rest)
    if (punctuation) {
      if (items.length > 0) {
        items[items.length - 1]!.value += punctuation[0]
      }
      index += punctuation[0].length
      continue
    }
    const word = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*-?/.exec(rest)
    if (word) {
      items.push({ value: `${forceTiedTarget ? '+' : ''}${word[0]}`, placeholder: false })
      forceTiedTarget = false
      index += word[0].length
      continue
    }

    if (items.length > 0) {
      items[items.length - 1]!.value += rest[0]
    } else {
      items.push({ value: rest[0], placeholder: false })
    }
    index += 1
  }

  return items
}

export function convertHappiLyrics(source: string) {
  return convertHappiLyricItems(source).map((item) => item.value).join(' ')
}
