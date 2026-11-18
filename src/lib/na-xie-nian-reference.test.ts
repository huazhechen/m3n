import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import plan from '../../scorebook/editorial-plan.json'
import categories from '../../scorebook/library-categories.json'
import source from '../scores/na_xie_nian_01.m3n?raw'
import reference from './fixtures/na-xie-nian-kuaiyuepu.json'

it('matches every original written note, duration, tie and printed lyric', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: reference.title, singer: reference.singer, composer: reference.composer, lyricist: reference.lyricist, key: reference.key, meterCount: 4, meterUnit: 4, tempo: reference.tempo })
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
  expect(actual).toEqual(reference.events)
  expect(part.bass.flatMap(bar => bar.events)).toEqual([])
})

it('preserves all 783 attacks in the original repeat and DS playback route', () => {
  const expected: number[][] = []
  let time = 0, tied = false
  for (const [start, end] of reference.playbackRanges) {
    for (const [pitch, beats, tie] of reference.events.slice(start, end)) {
      const duration = beats as number
      if (pitch !== null) {
        if (tied) expected.at(-1)![1] = time + duration
        else expected.push([time, time + duration, pitch as number])
      }
      time += duration
      tied = tie as boolean
    }
  }
  const performance = compileScorePerformance(parseM3NDocument(source))
  expect(time).toBe(reference.performedBeats)
  expect(performance.beats).toBe(reference.performedBeats)
  expect(expected).toHaveLength(783)
  expect(performance.notes.filter(note => note.channel === 0).map(note => [note.start, note.end, note.pitch])).toEqual(expected)
  expect(performance.notes.filter(note => note.channel !== 0)).toEqual([])
})

it('includes the score in both the book and the modern pop library category', () => {
  expect(plan.sourceCount).toBe(plan.entries.length)
  expect(plan.entries.filter(entry => entry.file === 'na_xie_nian_01.m3n')).toEqual([
    expect.objectContaining({ id: 'na_xie_nian', title: reference.title, section: 'pop' }),
  ])
  expect(categories.filter(category => category.files.includes('na_xie_nian_01.m3n')).map(category => category.id)).toEqual(['pop'])
})
