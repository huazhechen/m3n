import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import baselines from './fixtures/linear-song-baselines.json'

const ranges: Record<string, Array<[number, number, string]>> = {
  man_man_xi_huan_ni: [[0, 11, 'A'], [11, 22, 'A'], [22, 33, 'B'], [33, 37, 'C']],
  wo_yao_ni: [[0, 9, 'A'], [9, 19, 'B']],
  xin_bu_liao_qing: [[0, 17, 'A'], [17, 26, 'B']],
  yue_ban_xiao_ye_qu: [[0, 17, 'A'], [17, 31, 'B']],
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// Captured from each original itinerary before changing notation or lyric rows.
describe.each(baselines.filter(baseline => baseline.id in ranges))('$title without named sections', reference => {
  const source = readFileSync(new URL(`../scores/${reference.id}_01.m3n`, import.meta.url), 'utf8')

  it('has valid local navigation and preserves the complete performed event sequence', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    const document = parseM3NDocument(source)
    expect(document.order).toBeUndefined()
    expect(document.sections ?? []).toHaveLength(0)
    const bars = alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
    const pitches = resolveScorePitches(bars)
    const events = bars.flatMap(bar => bar.events.map(event => [
      pitches.get(event) ?? [], event.beats, event.tie ?? false,
      event.postfixes, event.dynamic ?? null, event.tempo,
    ]))
    expect(events).toHaveLength(reference.eventCount)
    expect(hash(events)).toBe(reference.eventsSha256)
    expect(compileScorePerformance(document).beats).toBe(reference.beats)
  })

  it('preserves every lyric and its performed note timing', () => {
    const document = parseM3NDocument(source)
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    const lyrics = compileScorePerformance(document).elements
      .filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => [element.start, element.end, lyric.text]))
    expect(lyrics).toHaveLength(reference.lyricCount)
    expect(hash(lyrics)).toBe(reference.lyricsSha256)
  })

  it('preserves each visited phrase count, every bar duration and every time signature', () => {
    const bars = parseM3NDocument(source).parts.get('score')!.melody.filter(bar => bar.events.length)
    const boundaries = ranges[reference.id]!
    expect(bars).toHaveLength(boundaries.at(-1)![1])
    const segments: Array<{ name: string; visit: number; barBeats: number[]; barMeters: number[][] }> = []
    const visits = new Map<string, number>()
    let previousIndex = -1, previousGroup = -1
    for (const index of playbackMeasureIndexes(bars)) {
      const group = boundaries.findIndex(([start, end]) => start <= index && index < end)
      expect(group).toBeGreaterThanOrEqual(0)
      const name = boundaries[group]![2]
      if (group !== previousGroup || index <= previousIndex) {
        const visit = (visits.get(name) ?? 0) + 1
        visits.set(name, visit)
        segments.push({ name, visit, barBeats: [], barMeters: [] })
      }
      const bar = bars[index]!
      segments.at(-1)!.barBeats.push(bar.events.reduce((sum, event) => sum + event.beats, 0))
      segments.at(-1)!.barMeters.push([bar.events[0]!.meterCount, bar.events[0]!.meterUnit])
      previousGroup = group
      previousIndex = index
    }
    expect(segments.map(segment => [segment.name, segment.visit, segment.barBeats.length]))
      .toEqual(reference.segments.map(segment => [segment.name, segment.visit, segment.barBeats.length]))
    expect(segments).toEqual(reference.segments)
  })
})
