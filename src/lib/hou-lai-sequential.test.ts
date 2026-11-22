import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const original = readFileSync(new URL('./fixtures/hou-lai-original.m3n', import.meta.url), 'utf8')
const source = readFileSync(new URL('../scores/hou_lai_01.m3n', import.meta.url), 'utf8')
// Apply the separately requested musical corrections to the historical arrangement,
// then check that the repeat notation preserves it event by event.
const instrumentalReference = original
  .replace('{key=C}', '{key=Eb}')
  .replace('(1e (2e 2e))', '(1e (1e 2e))')
  .replaceAll('((2e) 1e.) 1e~', '((2e) 1e.~) 1e~').replaceAll('再{%2}', '再%')
  .replace('{lg}((2e) 1e){/} ((1e~))', '(2e.) ((1e~))').replace('星%光', '星光')
  .replace('{lg}((5 6)){/} 6^', '(6) 6^').replace('年少%时', '年少时')
const before = parseM3NDocument(instrumentalReference), after = parseM3NDocument(source)
const performedBars = (document: typeof before) => unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
const oldBars = performedBars(before), newBars = performedBars(after)
// The sole authorized correction: A's second ending loses one held beat;
// The third pickup follows that three-beat ending. All other events remain in order.
const changedIndex = oldBars.slice(0, 54).reduce((count, bar) => count + bar.events.length, 0) - 1
const events = (bars: typeof oldBars) => {
  const pitches = resolveScorePitches(bars)
  return bars.flatMap(bar => bar.events.map(event => ({
    pitches: pitches.get(event) ?? [], beats: event.beats, tie: event.tie ?? false,
    postfixes: event.postfixes, dynamic: event.dynamic ?? null, tempo: event.tempo,
  })))
}
const lyrics = (document: typeof before) => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  return compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => ({ start: element.start, end: element.end, text: lyric.text })))
}

describe('Hou Lai written as A, B, repeated A, C', () => {
  it('uses a written chorus and a two-pass chorus with single-bar endings and preserves every event except the previously authorized held beat', () => {
    expect(after.key).toBe('Eb')
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(after.order).toBeUndefined()
    expect(after.sections ?? []).toEqual([])
    const printed = after.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(printed).toHaveLength(60)
    expect(printed.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
    expect(printed.filter(bar => bar.right === 'rptend')).toHaveLength(1)
    expect(printed.some(bar => bar.right === 'double')).toBe(false)
    const repeatStart = printed.find(bar => bar.left === 'rptstart')!
    expect(repeatStart.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    const firstEnding = printed.find(bar => bar.ending === '1')!
    expect(firstEnding.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    expect(firstEnding.events.slice(-3).map(event => event.pitches)).toEqual([['3e'], ['2e'], ['1e']])
    expect(printed.flatMap((bar, index) => bar.ending ? [[index + 1, bar.ending]] : [])).toEqual([[54, '1'], [55, '2']])
    const expected = events(oldBars)
    expect(expected).toHaveLength(406)
    expect(expected[changedIndex]!.beats).toBe(2)
    expected[changedIndex]!.beats = 1
    expect(events(newBars)).toEqual(expected)
    expect(compileScorePerformance(before).beats).toBe(261)
    expect(compileScorePerformance(after).beats).toBe(260)
  })

  it('joins the first ending and the next pickup into one full bar without changing the performance', () => {
    const snapshot = (bars: typeof oldBars) => bars.map(bar => ({
      beats: bar.events.reduce((sum, event) => sum + event.beats, 0),
      meter: [bar.events[0]!.meterCount, bar.events[0]!.meterUnit],
    }))
    const expected = snapshot(oldBars)
    expect(expected).toHaveLength(68)
    expect(expected.slice(53, 55).map(bar => bar.beats)).toEqual([4, 1])
    expected[53]!.beats = 3
    expected.splice(53, 2, { ...expected[53]!, beats: 4 })
    expect(snapshot(newBars)).toEqual(expected)
    expect(newBars).toHaveLength(67)
  })

  it('preserves every lyric, shifting only lyrics after the shortened hold by one beat', () => {
    const cutoff = oldBars.slice(0, 54).reduce((sum, bar) => sum + bar.events.reduce((n, event) => n + event.beats, 0), 0)
    const expected = lyrics(before).map(lyric => ({
      ...lyric,
      start: lyric.start >= cutoff ? lyric.start - 1 : lyric.start,
      end: lyric.end >= cutoff ? lyric.end - 1 : lyric.end,
    }))
    expect(expected).toHaveLength(326)
    expect(lyrics(after)).toEqual(expected)
  })
})
