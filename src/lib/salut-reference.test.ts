import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/ai_de_li_zan_01.m3n?raw'
import reference from './fixtures/salut-reference.json'
import plan from '../../scorebook/editorial-plan.json'
import categories from '../../scorebook/library-categories.json'

it('preserves the Kuaiyuepu Salut main melody, modulation and both endings', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toEqual([])
  const performance = compileScorePerformance(document)
  const events = reference.events as [number, number, number, boolean][]
  expect(performance.beats).toBe(reference.beats)
  expect(performance.notes).toHaveLength(events.length)
  events.forEach(([start, end, pitch, grace], index) => {
    let expectedStart = start, expectedEnd = end
    // Upstream anticipates the host; M3N plays each short grace on the beat.
    if (grace) {
      let first = index, host = index + 1
      while (first > 0 && events[first - 1]![3]) first--
      while (events[host]![3]) host++
      expectedStart = events[host]![0] + (index - first) / 16
      expectedEnd = expectedStart + 1 / 16
    } else {
      let previous = index - 1
      while (previous >= 0 && events[previous]![3]) previous--
      expectedStart += (index - previous - 1) / 16
    }
    const actual = performance.notes[index]!
    expect(actual.pitch, `attack ${index + 1}`).toBe(pitch)
    expect(actual.start, `attack ${index + 1} onset`).toBeCloseTo(expectedStart, 6)
    expect(actual.end, `attack ${index + 1} release`).toBeCloseTo(expectedEnd, 6)
  })
  const file = 'ai_de_li_zan_01.m3n'
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(plan.entries.find(entry => entry.file === file)?.section).toBe('instrumental')
  expect(categories.flatMap(category => category.files).filter(name => name === file)).toHaveLength(1)
})
