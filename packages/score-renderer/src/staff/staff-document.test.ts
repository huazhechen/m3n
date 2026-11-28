import { describe, expect, it } from 'vitest'
import { analyzeM3N, deriveScoreInteraction } from '@m3n/notation'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectStaffDocument, staffKey } from './staff-document.js'

describe('direct staff display projection', () => {
  it('preserves every source and playback ID, child lyric and absolute pitch without mutation', () => {
    const score = analyzeM3N('{title=春天 & <歌>}{key=D}{4/4}\nN: [123:2] 4 5 | [135:h]^ 0^ |||\nL: 春夏秋冬天\nB: 1d 2d 3d 4d | 5d^ 0^ |||').score
    const before = structuredClone(score), document = projectStaffDocument(score)
    const events = document.measures.flatMap(m => [...m.melody, ...m.bass]).flatMap(e => [e, ...e.children ?? []])
    for (const { xmlId } of deriveScoreInteraction(score).sourceMap) expect(events.some(e => e.id === xmlId), xmlId).toBe(true)
    expect(document.hasBass).toBe(true)
    expect(document.measures[0]!.key).toBe('D')
    expect(document.measures[0]!.melody[0]!.children![0]!.pitches[0]!.key).toBe('d/4')
    expect(events.flatMap(e => e.lyrics.map(l => l.text))).toContain('春')
    expect(score).toEqual(before)
  })
  it('prints keyed visits with the matching octave, lyrics, and performed identity', () => {
    const score = analyzeM3N('{key=C}{4/4}{order=A,A@D5}\n===A\nN: 1 2 3 4 |||\nL1: 春夏秋冬\nL2: 山川天地').score
    const before = structuredClone(score)
    const document = projectStaffDocument(score)
    const second = document.measures.flatMap(m => m.melody).find(e => e.id === 'm3n-e-1-rend2')!
    expect(second.pitches[0]!.key).toBe('d/5')
    expect(second.lyrics[0]!.text).toBe('山')
    expect(document.measures[1]!.key).toBe('D')
    expect(score).toEqual(before)
  })
  it('keeps ordinary repeats compact and expands numbered pass keys', () => {
    expect(projectStaffDocument(analyzeM3N('{2/4}\nN: ||: 1 2 :|||').score).measures).toHaveLength(1)
    const document = projectStaffDocument(analyzeM3N('{key=Eb}{2/4}\nN: ||: {key=Eb,F}1 2 :|||\nL1: First time\nL2: Next time').score)
    const second = document.measures.flatMap(m => m.melody).find(e => e.id === 'm3n-e-1-rend2')!
    expect(second.pitches[0]!.key).toBe('f/4')
    expect(second.lyrics[0]!.text).toBe('Next')
  })
  it('retains accidentals in their octave and resets them at barlines', () => {
    const document = projectStaffDocument(analyzeM3N('{key=C}{4/4}\nN: 1# 1 1e 1 | 1 2 3 4 |||').score)
    expect(document.measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['c#/4', 'c#/4', 'c/5', 'c#/4'])
    expect(document.measures[1]!.melody[0]!.pitches[0]!.key).toBe('c/4')
  })
  it('transposes pitch, signature and octave through semitone boundaries', () => {
    const document = projectStaffDocument(analyzeM3N('{key=C}{4/4}\nN: 7 1e 2e 3e |||').score, 1)
    expect(document.measures[0]!.key).toBe('Db')
    expect(document.measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['c/5', 'db/5', 'eb/5', 'f/5'])
    expect(staffKey('Am')).toBe('C')
    expect(staffKey('Ddor')).toBe('C')
  })
  it('projects the whole library and independent works without losing events', () => {
    for (const scope of ['scores', 'works', 'examples']) for (const file of readdirSync(resolve(import.meta.dirname, `../../../../src/${scope}`)).filter(f => f.endsWith('.m3n'))) {
      const score = analyzeM3N(readFileSync(resolve(import.meta.dirname, `../../../../src/${scope}/${file}`), 'utf8')).score
      const before = structuredClone(score)
      const document = projectStaffDocument(score)
      expect(document.measures.length, file).toBeGreaterThan(0)
      const ids = document.measures.flatMap(m => [...m.melody, ...m.bass]).map(e => e.id)
      expect(new Set(ids).size, file).toBe(ids.length)
      expect(score, file).toEqual(before)
    }
  })
})

it('applies grace accidentals before the main note and transposes grace pitches with it', () => {
  const score = analyzeM3N('{key=C}{4/4}\nN: 1{ac(1#)} 1 2 3 |||').score
  const before = structuredClone(score)
  const document = projectStaffDocument(score)
  expect(document.measures[0]!.melody[0]!.graces![0]!.pitches[0]!.key).toBe('c#/4')
  expect(document.measures[0]!.melody.slice(0, 2).map(e => e.pitches[0]!.key)).toEqual(['c#/4', 'c#/4'])
  expect(projectStaffDocument(score, 2).measures[0]!.melody[0]!.graces![0]!.pitches[0]!.key).toBe('d#/4')
  expect(score).toEqual(before)
})

it('spells transposed notes by their diatonic degree in the destination signature', () => {
  const score = analyzeM3N('{key=C}{4/4}\nN: 4 7 1e 4e |').score
  expect(projectStaffDocument(score, 5).measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['bb/4', 'e/5', 'f/5', 'bb/5'])
  expect(projectStaffDocument(score, 6).measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['b/4', 'e#/5', 'f#/5', 'b/5'])
  expect(projectStaffDocument(score, -12).measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['f/3', 'b/3', 'c/4', 'f/4'])
})

it('transposes Roman, absolute and slash chord symbols with the notes', () => {
  const score = analyzeM3N('{key=C}{4/4}\nN: 1 2 3 4 | 1 2 3 4 | 1 2 3 4 |\nC: IV | G/B | N.C. |').score
  const before = structuredClone(score)
  const projected = projectStaffDocument(score, 5)
  expect(projected.measures.map(m => m.melody[0]!.chord)).toEqual(['Bb', 'C/E', 'N.C.'])
  expect(score).toEqual(before)
})

it('normalizes theoretical signatures enharmonically instead of silently substituting C major', () => {
  const score = analyzeM3N('{key=G#}{4/4}\nN: 1 2 3 4 |').score
  const projected = projectStaffDocument(score)
  expect(projected.measures[0]!.key).toBe('Ab')
  expect(projected.measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['ab/4', 'bb/4', 'c/5', 'db/5'])
  expect(projectStaffDocument(score, 1).measures[0]!.key).toBe('A')
  expect(projectStaffDocument(score, 1).measures[0]!.melody.map(e => e.pitches[0]!.key)).toEqual(['a/4', 'b/4', 'c#/5', 'd/5'])
})
