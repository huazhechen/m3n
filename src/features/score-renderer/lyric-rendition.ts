/**
 * Verovio numbers occurrences of a written note, while lyric verse numbers
 * are global playback passes and can begin later inside an alternate ending.
 */
export function lyricVerseIndexForRendition(verseCount: number, rendition: number) {
  return verseCount === 0 ? -1 : Math.min(Math.max(0, rendition - 1), verseCount - 1)
}
