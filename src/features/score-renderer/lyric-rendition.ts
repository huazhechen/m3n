/**
 * Verovio numbers occurrences of a written note, while lyric verse numbers
 * are global playback passes and can begin later inside an alternate ending.
 */
export function lyricVerseIndexForRendition(verseCount: number, rendition: number) {
  return verseCount === 0 ? -1 : Math.min(Math.max(0, rendition - 1), verseCount - 1)
}

type RenderedVerse = { id: string; textContent: string | null; classList?: Iterable<string> }

function verseNumber(verse: Pick<RenderedVerse, 'id'>) {
  return Number(/-v(\d+)$/.exec(verse.id)?.[1] ?? 0)
}

function versePasses(verse: Pick<RenderedVerse, 'classList'>) {
  const value = [...(verse.classList ?? [])].find((className) => className.startsWith('m3n-passes-'))
  return value?.slice('m3n-passes-'.length).split('-').map(Number).filter(Number.isInteger) ?? []
}

export function visibleLyricVerseNumbers(verses: Iterable<RenderedVerse>) {
  return [...new Set([...verses]
    .filter((verse) => verse.textContent?.replaceAll('\u200B', '').trim())
    .map(verseNumber)
    .filter((number) => number > 0))].sort((left, right) => left - right)
}

/** Cycles through visible lyric rows, ignoring blank placeholder rows. */
export function lyricVerseIndexForMeasureRendition(
  verses: readonly Pick<RenderedVerse, 'id' | 'classList'>[],
  rendition: number,
  visibleVerseNumbers: readonly number[],
) {
  if (verses.length === 0) return -1
  if (visibleVerseNumbers.length === 0) return 0
  const matchingPass = verses.findIndex((verse) => (
    visibleVerseNumbers.includes(verseNumber(verse)) && versePasses(verse).includes(rendition)
  ))
  if (matchingPass >= 0) return matchingPass
  const selectedNumber = visibleVerseNumbers[(Math.max(1, rendition) - 1) % visibleVerseNumbers.length]
  const index = verses.findIndex((verse) => verseNumber(verse) === selectedNumber)
  return index >= 0 ? index : 0
}
