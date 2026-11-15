import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest' 
import createVerovioModule from '../vendor/verovio/verovio-module.mjs'
import { VerovioToolkit } from 'verovio/esm'
import { BasicMIDI } from 'spessasynth_core'
import { m3nToMei } from '@m3n/notation'
import { normalizePlaybackElementId, PlaybackScore } from './playback-score'

async function renderedPitches(source: string) {
  const toolkit = new VerovioToolkit(await createVerovioModule())
  try {
    expect(toolkit.loadData(m3nToMei(source).mei)).toBe(1)
    const binary = atob(toolkit.renderToMIDI().replace(/^data:audio\/midi;base64,/, ''))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const midi = BasicMIDI.fromArrayBuffer(bytes.buffer)
    return midi.tracks.flatMap((track) => track.events
      .filter((event) => event.statusByte === 144 && event.data[1] > 0)
      .map((event) => event.data[0]))
  } finally {
    toolkit.destroy()
  }
}

describe('MIDI playback', () => {
  it('exposes MIDI timing without any engraving API', async () => {
    const score=await PlaybackScore.create(m3nToMei('{2/4}\nN: 1 2 |||').mei)
    try { expect(score.midi().byteLength).toBeGreaterThan(20); expect(score.timeForElement('m3n-e-2')).toBeGreaterThan(0); expect(score).not.toHaveProperty('layout'); expect(score).not.toHaveProperty('renderPage') } finally { score.destroy() }
  })

  it.each([
    ['{2/4}\nN: ||: 1 2 | 3 4 :||\nNs[2]: 2: (5 6) 7 |','{2/4}\nN: 1 2 | 3 4 | 1 2 | (5 6) 7 |||'],
    ['{2/4}{order=A,B,A}\n===A\nN: 1 2 ||\nNs[2]: 1: 3 4 |\n===B\nN: 5 6 |||','{2/4}\nN: 1 2 | 5 6 | 3 4 |||'],
    ['{key=G}{2/4}{order=A,A}\n===A\nN: {p}{cresc}1 2{/} | {lg}3 4 | 5 6{/} ||\nNs[2]: 1: {p}{cresc}(5 6) 7{/} |','{key=G}{2/4}\nN: {p}{cresc}1 2{/} | {lg}3 4 | 5 6{/} | {p}{cresc}(5 6) 7{/} | {lg}3 4 | 5 6{/} |||'],
    ['{2/4}\nN: ||: 1 2 |\nNs[2]: 1: 6 7 |\n---V1\nN: 3 4 | 5 6 :||\n---V2\nN: 7 1e | 2e 3e |||','{2/4}\nN: 1 2 | 3 4 | 5 6 | 6 7 | 7 1e | 2e 3e |||'],
    ['{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 | 5 6 :||\n---V2\nN: 7 1e | 2e 3e |||\nNs[2]: 1: 4 5 |','{2/4}\nN: 1 2 | 3 4 | 5 6 | 1 2 | 4 5 | 2e 3e |||'],
  ])('plays each alternative with the exact pitches, timing and dynamics of explicit music', async (compact,unfolded)=>{
    const performance=async (source:string)=>{
      const score=await PlaybackScore.create(m3nToMei(source).mei)
      try {
        const midi=BasicMIDI.fromArrayBuffer(score.midi())
        return {events:midi.tracks.map(track=>track.events.filter(e=>[128,144].includes(e.statusByte & 240)).map(e=>[e.ticks,e.statusByte,...e.data])),duration:midi.duration}
      } finally {score.destroy()}
    }
    expect(await performance(compact)).toEqual(await performance(unfolded))
  })

  it('maps alternative timing to its compact printed note and actual pass',async()=>{
    const score=await PlaybackScore.create(m3nToMei('{2/4}{300qpm}\nN: ||: 1 2 | 3 4 :||\nNs[2]: 2: (5 6) 7 |').mei)
    try {
      score.midi()
      expect(score.elementsAtTime(1300)).toContainEqual({xmlId:'m3n-e-a1-1',rendition:2})
      expect(score.elementsAtTime(900)).toContainEqual({xmlId:'m3n-e-1',rendition:2})
    } finally {score.destroy()}
  })

  // Captured reference performances, including note-offs, onset ticks and velocities.
  it.each([
    ['hou_lai', 'd8ec4adc3b00d2869886d11b6c4e114e5d13de33fd0579412ce9c56150f05f01', 208.79333333333332],
    ['castle_in_the_sky', '31e339e275588a9c427df9dec2e2097b27377b1d357196dd0c033c55814984c4', 155.16798965833334],
    ['doraemon', '806e0a95302f8e75e51532d6109981155707986c9264bd42dd35a8cbc9acf96a', 111.99583333333334],
    ['flower_dance', '94c9ee30af0921b362395d95fcb7ea83245c693ce995443cb4824fdf9cea83d5', 251.995],
    ['tong_zhuo_de_ni', '9d2fa93f6ca1131f47a4932fbf681147b594785d9d11381b7ab4ec2a5db02b08', 149.99479166666666],
    ['valsentino', '74c715f2f522f14adce054815ec5a178f783ffab712c25fe22b700c97ad8b7c5', 159.54257109166667],
    ['zhi_ai_li_si', '1a20564e7fed4c53754d99e17c38f2a5659769daac94560192e80efdfb89a635', 173.24375],
    ['beer_barrel_polka', 'a20e4d68646b5e6b74ade7d8339750673f3a0966393790f6bf8c684b34434952', 152.723332125],
  ])('preserves the captured complete MIDI performance for %s', async (file, hash, duration) => {
    const source = readFileSync(new URL(`../../../src/scores/${file}_01.m3n`, import.meta.url), 'utf8')
    const conversion = m3nToMei(source)
    expect(conversion.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(conversion.mei)).toBe(1)
      const midi = BasicMIDI.fromArrayBuffer(Uint8Array.from(atob(toolkit.renderToMIDI()), c => c.charCodeAt(0)).buffer)
      const events = midi.tracks.map(track => track.events.filter(e => [128, 144].includes(e.statusByte & 240)).map(e => [e.ticks, e.statusByte, ...e.data]))
      expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe(hash)
      expect(midi.duration).toBeCloseTo(Number(duration), 6)
    } finally { toolkit.destroy() }
  })

  it('plays named sections in the declared order without duplicating the printed measures', async () => {
    const compact='{2/4}{order=A,A,B,A,C1,B,A,C2}\n===A\nN: 1 2 ||\nL1: 甲乙\nL2: 丙丁\nL3: 戊己\nL4: 庚辛\n===B\nN: 3 4 ||\n===C1\nN: 5 6 ||\n===C2\nN: 7 1e |||'
    const unfolded='{2/4}\nN: 1 2 | 1 2 | 3 4 | 1 2 | 5 6 | 3 4 | 1 2 | 7 1e |||'
    expect(await renderedPitches(compact)).toEqual(await renderedPitches(unfolded))
    const toolkit=new VerovioToolkit(await createVerovioModule())
    try {
      toolkit.setOptions({font:'Leipzig',header:'none',footer:'none'})
      expect(toolkit.loadData(m3nToMei(compact).mei)).toBe(1)
      toolkit.renderToMIDI()
      expect(toolkit.getTimeForElement('m3n-e-1-rend2')).toBeGreaterThan(toolkit.getTimeForElement('m3n-e-1'))
      expect(normalizePlaybackElementId('m3n-e-1-rend4')).toEqual({xmlId:'m3n-e-1',rendition:4})
    } finally {toolkit.destroy()}
  })

  it('restores section key, tempo and dynamics when a section is revisited', async () => {
    const compact='{3/4}{120qpm}{order=A,B,A}\n===A\nN: {p}4^ 1 ||\n===B\nN: {2/4}{key=G}{60qpm}{f}7^ |||'
    const unfolded='{3/4}{120qpm}\nN: {p}4^ 1 | {2/4}{key=G}{60qpm}{f}7^ | {3/4}{key=C}{120qpm}{p}4^ 1 |||'
    const performance=async (source:string)=>{
      const toolkit=new VerovioToolkit(await createVerovioModule())
      try {
        toolkit.loadData(m3nToMei(source).mei)
        const binary=atob(toolkit.renderToMIDI())
        const midi=BasicMIDI.fromArrayBuffer(Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer)
        return {
          notes: midi.tracks.flatMap(track => track.events.filter(e => (e.statusByte & 0xf0) === 144 && e.data[1]! > 0).map(e => ({ tick: e.ticks, pitch: e.data[0], velocity: e.data[1] }))),
          duration: midi.duration,
          tempos: midi.tempoChanges,
        }
      } finally {toolkit.destroy()}
    }
    expect(await performance(compact)).toEqual(await performance(unfolded))
  })

  it('plays all four White Birch stanzas and both endings from the compact source', async () => {
    const source = readFileSync(new URL('../../../src/scores/bai_hua_lin_01.m3n', import.meta.url), 'utf8')
    const sections = new Map([...source.matchAll(/^===(\w+)\nN: ([^\n]+)/gm)].map(match => [match[1], match[2]!.replace(/\|+$/, '|')]))
    const order = ['A', 'A', 'B', 'A', 'C1', 'B', 'A', 'C2']
    const unfolded = '{key=F}{3/4}{120qpm}\nN: ' + order.map(name => sections.get(name)).join(' ')
    const expected = await renderedPitches(unfolded)
    expect(expected).toHaveLength(313)
    expect(await renderedPitches(source)).toEqual(expected)
    expect(m3nToMei(source).mei.match(/<measure\b/g)).toHaveLength(48)
  })

  it('combines named visits with local repeats and complementary pickups', async () => {
    const compact = '{2/4}{order=A,B,A}\n===A\nN: ||: 1 | 2 3 | 4 :||\n===B\nN: 5 6 |||'
    const unfolded = '{2/4}\nN: 1 | 2 3 | 4 | 1 | 2 3 | 4 | 5 6 | 1 | 2 3 | 4 | 1 | 2 3 | 4 |||'
    expect(await renderedPitches(compact)).toEqual(await renderedPitches(unfolded))
  })

  it('preserves the complete Turkish March performance while omitting its written reprises', async () => {
    const source = readFileSync(new URL('../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8')
    const result = m3nToMei(source)
    expect(result.diagnostics).toEqual([])
    expect(result.mei.match(/<measure\b/g)).toHaveLength(94)
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(result.mei)).toBe(1)
      const midi = BasicMIDI.fromArrayBuffer(Uint8Array.from(atob(toolkit.renderToMIDI()), c => c.charCodeAt(0)).buffer)
      const notes = midi.tracks.flatMap(track => track.events.filter(event => (event.statusByte & 0xf0) === 144 && event.data[1]! > 0).map(event => [event.ticks, event.data[0], event.data[1]]))
      expect(notes).toHaveLength(1110)
      expect(midi.duration).toBeCloseTo(203.632372125, 6)
      // Captured from the previous 138-measure source: pitches, onsets and velocities.
      expect(createHash('sha256').update(JSON.stringify(notes)).digest('hex')).toBe('bf19c8c9bfb9ab4a4e9cf522f7e59e142b6e399c0ee7a74b38e4ea6238ae67aa')
    } finally { toolkit.destroy() }
  })

  it('assigns melody and bass to distinct MIDI channels for independent muting', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(m3nToMei('{4/4}\nN: 1 2 3 4 |||\nB: 1d 2d 3d 4d |||').mei)).toBe(1)
      const binary = atob(toolkit.renderToMIDI().replace(/^data:audio\/midi;base64,/, ''))
      const midi = BasicMIDI.fromArrayBuffer(Uint8Array.from(binary, char => char.charCodeAt(0)).buffer)
      const on = midi.tracks.flatMap(track => track.events).filter(event => (event.statusByte & 0xf0) === 0x90 && event.data[1]! > 0)
      expect(new Set(on.map(event => event.statusByte & 0xf))).toEqual(new Set([0, 1]))
      expect(on.filter(event => (event.statusByte & 0xf) === 0).map(event => event.data[0])).toEqual([60, 62, 64, 65])
      expect(on.filter(event => (event.statusByte & 0xf) === 1).map(event => event.data[0])).toEqual([48, 50, 52, 53])
    } finally { toolkit.destroy() }
  })
  it('maps chord-member playback IDs back to their chord event', () => {
    expect(normalizePlaybackElementId('m3n-e-12-v2-rend3')).toEqual({ xmlId: 'm3n-e-12', rendition: 3 })
  })

  it('maps tuplet-child playback IDs back to their parent event', () => {
    expect(normalizePlaybackElementId('m3n-e-12-n2')).toEqual({ xmlId: 'm3n-e-12', rendition: 1 })
  })

  it('accepts key changes when changing from A major to C major', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(m3nToMei('{key=A} {4/4}\n1 2 3 4 | {key=C}1 2 3 4 |||').mei)).toBe(1)
    } finally {
      toolkit.destroy()
    }
  })

  it('accepts a section label anchored to a tuplet note', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(m3nToMei('{2/4}\n===A\nN: ([123:2]) |||').mei)).toBe(1)
    } finally {
      toolkit.destroy()
    }
  })

  it('uses Verovio playback expansion for endings, repeats, D.S., and D.C.', async () => {
    await expect(renderedPitches('{2/4}\nN: 1 2 |\n---V1\nN: 3 4 ||\n---V2\nN: 5 6 |||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69])
    await expect(renderedPitches('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69])
    await expect(renderedPitches('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2,V3,V4\nN: 5 6 :||{x4} |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69, 60, 62, 67, 69, 60, 62, 67, 69])
  })
})

// Fingerprints preserve editorial performances across structural changes.
// The fixture records the authorised 老男孩 correction and the D.S. tie cleanup
// in 牵丝戏; 听海 already excludes its spurious first-verse repeat.
const editorialMidi = JSON.parse(readFileSync(new URL('./fixtures/editorial-midi.json', import.meta.url),'utf8')) as {id:string;duration:number;sha256:string}[]
it.each(editorialMidi)('preserves the complete editorial performance of $id', async expected => {
 const source=readFileSync(new URL(`../../../src/scores/${expected.id}_01.m3n`,import.meta.url),'utf8')
 const converted=m3nToMei(source)
 expect(converted.diagnostics).toEqual([])
 const score=await PlaybackScore.create(converted.mei)
 try {
  const midi=BasicMIDI.fromArrayBuffer(score.midi())
  const events=midi.tracks.map(track=>track.events.filter(e=>[128,144].includes(e.statusByte&240)).map(e=>[e.ticks,e.statusByte,...e.data]))
  expect(midi.duration).toBeCloseTo(expected.duration,6)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe(expected.sha256)
 } finally {score.destroy()}
})
