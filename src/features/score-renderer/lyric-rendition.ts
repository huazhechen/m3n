/**
 * Verovio numbers occurrences of a written note, while lyric verse numbers
 * are global playback passes and can begin later inside an alternate ending.
 */
export function lyricVerseIndexForRendition(verseCount: number, rendition: number) {
  return verseCount === 0 ? -1 : Math.min(Math.max(0, rendition - 1), verseCount - 1)
}

/** A repeated measure with only first-pass lyrics reuses that first lyric line. */
export function lyricVerseIndexForMeasureRendition(verseCount: number, rendition: number, hasLaterVisibleLyrics: boolean) {
  if (verseCount === 0) return -1
  return hasLaterVisibleLyrics ? lyricVerseIndexForRendition(verseCount, rendition) : 0
}

export function measureHasLaterVisibleLyrics(verses: Iterable<{ id: string; textContent: string | null }>) {
  return [...verses].some((verse) => {
    const verseNumber = Number(/-v(\d+)$/.exec(verse.id)?.[1] ?? 0)
    return verseNumber > 1 && verse.textContent?.replaceAll('\u200B', '').trim()
  })
}
