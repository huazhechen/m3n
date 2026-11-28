import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/meng_huan_qu_01.m3n?raw'
import reference from './fixtures/traumerei-reference.json'

it('preserves the Kuaiyuepu Träumerei melody, repeat route and fermatas', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toEqual([])
  expect(source).not.toContain('{lyricist=')
  expect(source).not.toContain('{breath}')
  expect(source).not.toMatch(/^---V/m)
  expect(source.match(/\{fermata\}/g)).toHaveLength(3)
  const performance = compileScorePerformance(document)
  expect(performance.notes).toHaveLength(reference.events.length)
  expect(performance.beats).toBe(reference.beats - 1)
  reference.events.forEach(([start, end, pitch], index) => {
    const actual = performance.notes[index]!
    expect(actual.pitch, `attack ${index + 1}`).toBe(pitch)
    expect(actual.start, `attack ${index + 1} onset`).toBeCloseTo(start!, 6)
    // Approved pickup normalization: shorten only the final tonic by one beat.
    const expectedEnd = index === reference.events.length - 1 ? end! - 1 : end!
    expect(actual.end, `attack ${index + 1} release`).toBeCloseTo(expectedEnd, 6)
  })
})
