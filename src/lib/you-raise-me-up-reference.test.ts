import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/you_raise_me_up_01.m3n?raw'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

// Independently read from the uploaded image: degree (0 = rest), quarter-note beats.
const reference = [
  '0:1 0:1 0:.75 5d:.25 5d:.5 1:.5',
  '3:1 3:.75 1:.25 2:.75 1:.25 1:.75 6d:.25',
  '6d:.5 1:1.5 0:.75 7d:.25 1:.25 3:.75',
  '5:1 0:.75 1:.25 6:.5 5:.5 5:.5 5:.25 3:.25',
  '2:2 0:.75 5:.25 6:.5 7:.5',
  '1e:1 1e:.75 7:.25 7:.5 6:.5 0:.5 5:.25 6:.25',
  '5:1 3:.5 0:.5 0:.75 5d:.25 5:.5 4:.5',
  '3:1 0:.75 3:.25 3:.5 2:.25 1:.25 1:.5 7d:.5',
  '1:2 0:.75 5:.25 6:.5 7:.5',
  '1e:1.5 7:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 3:1 0:.75 5:.25 2e:.75 1e:.25',
  '1e:1 0:.5 7:.5 7:.5 6:.5 5:.25 4:.25 5:.5',
  '5:2 0:1 5:.5 7:.5',
  '1e:1 1e:.75 7:.25 7:.5 6:.25 5:.25 5:.25 4:.5 5:.25',
  '5:1 1e:1 0:.75 5d:.25 5:.75 4:.25',
  '3:1 0:.75 3:.25 3:.5 2:.25 1:.25 1:.5 7d:.5',
  '1:3 0:1',
  '0:1 0:1 0:1 0:1',
  '0:1 0:1 0:.75 5:.25 6:.5 7:.5',
  '1e:1.5 7:.5 7:.5 6:.5 5:.5 4:.5',
  '5:1 3:1 0:.75 5:.25 2e:.75 1e:.25',
  '1e:1 0:.5 7:.5 7:.5 6:.5 5:.25 4:.25 5:.5',
  '5:2 0:1 5:.5 7:.5',
  '1e:1 1e:.75 7:.25 7:.5 6:.25 5:.25 5:.25 4:.5 5:.25',
  '5:1 1e:1 0:.75 5d:.25 5:.75 4:.25',
  '3:1 0:.75 3:.25 3:.5 2:.25 1:.25 1:.5 7d:.5',
  '1:2 0:.75 5:.25 6:.5 7:.5',
  '1:4',
  '0:1 0:1 0:.75 5d:.25 1:.5 2:.5',
  '3:1 0:.75 3:.25 3:.5 2:.25 1:.25 1:.5 7d:.5',
  '1e:4',
  '1e:4',
]
const expected = reference.map(bar => bar.split(' ').map(token => {
  const [degree, beats] = token.split(':')
  const value = Number(degree![0])
  const pitch = value === 0 ? null : 62 + [0, 2, 4, 5, 7, 9, 11][value - 1]! + (degree!.endsWith('e') ? 12 : degree!.endsWith('d') ? -12 : 0)
  return [pitch, Number(beats)]
}))

it('transcribes all 32 image bars, the D major pitches, sixteenth rhythms and ties', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ title: 'You Raise Me Up', key: 'D', meterCount: 4, meterUnit: 4, tempo: 60 })
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const scale: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  expect(bars.map(bar => bar.events.map(event => {
    const [name, octave, alteration] = pitches.get(event)?.[0]?.split(':') ?? []
    return [name ? 12 * (Number(octave) + 1) + scale[name]! + (alteration === 's' ? 1 : alteration === 'f' ? -1 : 0) : null, event.beats]
  }))).toEqual(expected)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(32).fill(4))
  expect(bars.flatMap((bar, index) => bar.events.flatMap((event, position) => event.tie ? [[index + 1, position + 1]] : [])))
    .toEqual([[2, 1], [4, 5], [6, 1], [8, 6], [14, 1], [14, 6], [16, 6], [24, 1], [24, 6], [26, 6], [30, 6], [31, 1]])
  // Bars 20–26 repeat, with bar 27 first ending, then bars 28–32 second ending.
  const route = [...Array.from({ length: 27 }, (_, index) => index), ...Array.from({ length: 7 }, (_, index) => index + 19), ...Array.from({ length: 5 }, (_, index) => index + 27)]
  const notes: number[][] = []
  let time = 0, tied = false
  for (const bar of route) for (const [index, [pitch, duration]] of expected[bar]!.entries()) {
    if (pitch !== null) {
      if (tied) notes.at(-1)![1] = time + duration!
      else notes.push([time, time + duration!, pitch!])
    }
    time += duration!
    tied = bars[bar]!.events[index]!.tie ?? false
  }
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(156)
  expect(performance.notes.map(note => [note.start, note.end, note.pitch])).toEqual(notes)
})

it('retains English syllables only, including lyrics under tied targets', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = bars.map(bar => bar.events.map(event => (lyricsByEvent.get(event) ?? []).filter(item => item.kind === 'text').map(item => item.text).join('')))
  expect(lyrics.flat().join(' ')).not.toMatch(/\p{Script=Han}/u)
  expect(lyrics[0]!.filter(Boolean)).toEqual(['When', 'I', 'am'])
  expect(lyrics[1]!.filter(Boolean)).toEqual(['down', 'and', 'oh', 'my', 'soul,', 'so'])
  for (const index of [15, 25, 29]) expect(lyrics[index]!.filter(Boolean)).toEqual(['up,', 'to', 'more', 'than', 'I', 'can'])
})

it('includes the song once in both the contemporary pop library and the book', () => {
  expect(plan.sourceCount).toBe(plan.entries.length)
  expect(plan.entries.filter(entry => entry.file === 'you_raise_me_up_01.m3n')).toEqual([
    expect.objectContaining({ id: 'you_raise_me_up', title: 'You Raise Me Up', section: 'pop' }),
  ])
  expect(categories.filter(category => category.files.includes('you_raise_me_up_01.m3n')).map(category => category.id)).toEqual(['pop'])
})
