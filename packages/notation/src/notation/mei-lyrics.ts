import type { ScoreLyricSyllable } from './score-document.js' 
import { escapeXml } from './mei-xml.js'

export type MeiVerseSyllable = ScoreLyricSyllable & {
  n: string
  verseIndex: number
  cjkSpacingCompensation: boolean
  passes?: ReadonlySet<number>
}

const CJK_OR_FULLWIDTH_CHARACTER = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\uFFE0-\uFFEE]/u
const PUNCTUATION_ONLY = /^\p{P}+$/u

export function needsCjkSpacingCompensation(value: string) {
  return CJK_OR_FULLWIDTH_CHARACTER.test(value)
}

function lyricText(lyric: MeiVerseSyllable) {
  const text = lyric.text.replaceAll('~', ' ')
  if (!lyric.cjkSpacingCompensation) return text
  const compensation = Array.from(text).filter(needsCjkSpacingCompensation).map(() => '\u200B').join('')
  return `${text}${compensation}`
}

function underlinedLyricText(lyric: MeiVerseSyllable) {
  return lyricText(lyric).split(/(\p{P}+)/u).filter(Boolean).map((segment) => (
    PUNCTUATION_ONLY.test(segment) ? escapeXml(segment) : `<rend>${escapeXml(segment)}</rend>`
  )).join('')
}

export function meiVerseXml(
  lyrics: readonly MeiVerseSyllable[],
  xmlId: string,
  visibleVerseIndexes?: ReadonlySet<number>,
) {
  const rows = new Map<number, MeiVerseSyllable[]>()
  for (const lyric of lyrics) {
    const row = rows.get(lyric.verseIndex) ?? []
    row.push(lyric)
    rows.set(lyric.verseIndex, row)
  }
  return [...rows.values()]
    .filter((items) => {
      const verseIndex = items[0]?.verseIndex ?? 0
      return visibleVerseIndexes === undefined
        || visibleVerseIndexes.has(verseIndex)
    })
    .map((items) => items.map((lyric) => {
      const passes = lyric.passes ? [...lyric.passes] : []
      const passType = passes.length > 1 ? ` type="m3n-passes-${passes.join('-')}"` : ''
      const connection = lyric.kind === 'extender'
        ? ' con="u"'
        : lyric.underlined
          ? ' type="m3n-text-underline"'
          : lyric.wordpos ? ` wordpos="${lyric.wordpos}"${lyric.wordpos === 't' ? '' : ' con="d"'}` : ''
      const text = lyric.kind === 'placeholder'
        ? lyric.cjkSpacingCompensation ? '\u2800\u200B' : '\u200B'
        : lyric.underlined && lyric.kind !== 'extender'
          ? underlinedLyricText(lyric)
          : escapeXml(lyricText(lyric))
      return `<verse xml:id="${xmlId}-v${lyric.verseIndex}" n="${lyric.n}"${passType}><syl${connection}>${text}</syl></verse>`
    }).join(''))
    .join('')
}
