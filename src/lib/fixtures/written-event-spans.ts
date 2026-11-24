import type { PerformanceElement } from '@m3n/notation'

/** Keep historical whole-event lyric fingerprints independent of tuplet highlighting. */
export function writtenEventSpans(elements: readonly PerformanceElement[]): PerformanceElement[] {
  const spans: PerformanceElement[] = []
  for (const element of elements) {
    const previous = spans.at(-1)
    if (element.tupletSlot !== undefined && element.tupletSlot > 0 && previous
      && previous.xmlId === element.xmlId && previous.rendition === element.rendition
      && previous.voice === element.voice && previous.orderIndex === element.orderIndex) {
      previous.end = element.end
    } else spans.push({ ...element })
  }
  return spans
}
