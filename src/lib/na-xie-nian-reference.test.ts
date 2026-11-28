import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/na_xie_nian_01.m3n?raw'
import reference from './fixtures/na-xie-nian-kuaiyuepu.json'

// Original reference event indices: six lyric-tail slides and one continuation of 她.
const removedSlides = new Set([207, 218, 225, 281, 292, 306])
const authorizedReferenceEvents = reference.events.flatMap((event, index) => {
  if (index === 198 || removedSlides.has(index)) return []
  const adjusted = [...event]
  // Bar 41, 次: restore scale degree 5 (C5 in F major) after the earlier sharps.
  if (index === 334) adjusted[0] = 72
  if (removedSlides.has(index + 1)) adjusted[1] = Number(event[1]) + Number(reference.events[index + 1]![1])
  return [{ index, event: adjusted }]
})

it('matches the reference with the authorized shortening, six merged lyric tails, the bar 41 natural and tempo 72', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: reference.title, singer: reference.singer, composer: reference.composer, lyricist: reference.lyricist, key: reference.key, meterCount: 4, meterUnit: 4, tempo: 72 })
  const part = document.parts.get('score')!
  const pitches = resolveScorePitches(part.melody)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const scale: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const accidental: Record<string, number> = { s: 1, f: -1 }
  const actual = part.melody.flatMap(bar => bar.events.map(event => {
    const pitch = pitches.get(event)?.[0]
    const [name, octave, alteration] = pitch?.split(':') ?? []
    const midi = pitch ? 12 * (Number(octave) + 1) + scale[name!]! + (accidental[alteration!] ?? 0) : null
    const lyric = (lyricsByEvent.get(event) ?? []).filter(item => item.kind === 'text').map(item => item.text).join('')
    return [midi, event.beats, event.tie ?? false, lyric]
  }))
  expect(actual).toEqual(authorizedReferenceEvents.map(item => item.event))
  expect(document.intervals.filter(interval => interval.kind === 'lg')).toEqual([])
  expect(source).not.toContain('%')
  expect(part.bass.flatMap(bar => bar.events)).toEqual([])
})

it('uses repeat bars and DC to preserve 765 attacks after merging the six lyric tails without an itinerary or segno', () => {
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toEqual([])
  expect(source).not.toMatch(/\{text=|^===|\{order=/m)
  const bars = document.parts.get('score')!.melody
  expect(bars.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
  expect(bars.filter(bar => bar.right === 'rptend')).toHaveLength(1)
  expect(bars.flatMap(bar => [...(bar.navigation ?? []), ...bar.events.flatMap(event => event.navigation)])).toEqual(['dc'])
  const expected: number[][] = []
  let time = 0, tied = false
  for (const [start, end] of reference.playbackRanges) {
    for (const { index, event } of authorizedReferenceEvents) {
      if (index < start || index >= end) continue
      const [pitch, beats, tie] = event
      const duration = beats as number
      if (pitch !== null) {
        if (tied) expected.at(-1)![1] = time + duration
        else expected.push([time, time + duration, pitch as number])
      }
      time += duration
      tied = tie as boolean
    }
  }
  const performance = compileScorePerformance(document)
  expect(time).toBe(reference.performedBeats - 3)
  expect(performance.beats).toBe(460)
  expect(expected).toHaveLength(765)
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(expected)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})
