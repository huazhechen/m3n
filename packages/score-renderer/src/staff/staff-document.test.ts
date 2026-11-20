import { describe, expect, it } from 'vitest'
import { analyzeM3N, deriveScoreInteraction } from '@m3n/notation'
import { readFileSync, readdirSync } from 'node:fs'
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
    for (const scope of ['scores', 'works', 'examples']) for (const file of readdirSync(`../../src/${scope}`).filter(f => f.endsWith('.m3n'))) {
      const score = analyzeM3N(readFileSync(`../../src/${scope}/${file}`, 'utf8')).score
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
