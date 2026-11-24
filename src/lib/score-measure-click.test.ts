// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NativePlaybackScore } from '@m3n/score-renderer/playback'
import { BasicMIDI, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core'
import { measureClickTarget, measureSeekProgress } from './score-measure-click'

it('resolves continued numbered measures to the first event on the previous page', () => {
  document.body.innerHTML = `<div id="paper"><svg>
    <g class="measure" id="m3n-measure-1-1" data-m3n-measure-id="m3n-measure-1-1">
      <g data-m3n-id="m3n-e-1"></g></g></svg><svg>
    <g class="measure" id="m3n-measure-1-1-s2" data-m3n-measure-id="m3n-measure-1-1">
      <rect/><g data-m3n-id="m3n-e-4"></g></g></svg></div>`
  const paper = document.getElementById('paper')!
  expect(measureClickTarget(paper, paper.querySelector('rect')!)).toEqual({ xmlId: 'm3n-e-1', playbackId: 'm3n-e-1' })
  expect(measureClickTarget(paper, paper.querySelector('svg')!)).toBeNull()
})

it('preserves the performed visit for staff fragments while locating the written source', () => {
  document.body.innerHTML = `<div id="paper"><svg>
    <g class="measure" id="m3n-measure-1-3-fragment-1"><g id="m3n-e-2-rend2-n1"/></g>
    <g class="measure" id="m3n-measure-1-3-fragment-2"><g id="m3n-e-3-rend2"/></g>
    </svg></div>`
  const paper = document.getElementById('paper')!
  expect(measureClickTarget(paper, paper.querySelector('[id="m3n-e-3-rend2"]')!)).toEqual({ xmlId: 'm3n-e-2', playbackId: 'm3n-e-2-rend2' })
})

it.each([73, 137, 180])('plays the entire first note after a measure seek at %i BPM', async bpm => {
  const score = await NativePlaybackScore.create(parseM3NDocument(`{4/4}{${bpm}qpm}\nN: 1 2 3 4 | 5 6 7 1 |||`))
  const midi = BasicMIDI.fromArrayBuffer(score.midi())
  const synth = new SpessaSynthProcessor(48000)
  let clock = 0
  Object.defineProperty(synth, 'currentTime', { get: () => clock })
  const sequencer = new SpessaSynthSequencer(synth)
  sequencer.preload = false
  sequencer.externalMIDIPlayback = true
  sequencer.skipToFirstNoteOn = false
  sequencer.loopCount = 0
  sequencer.loadNewSongList([midi])
  sequencer.play()
  const notes: number[][] = []
  sequencer.onEventCall = event => {
    if (event.type !== 'midiMessage') return
    const message = [...event.data.message]
    if ((message[0]! & 224) === 128) notes.push(message)
  }
  sequencer.currentTime = measureSeekProgress(score.timeForElement('m3n-e-5'), midi.duration) * midi.duration
  clock = 0.01
  sequencer.processTick()
  expect(notes).toEqual([[144, 67, 64]])
  clock = 0.1
  sequencer.processTick()
  expect(notes).toEqual([[144, 67, 64]])
  clock = 60 / bpm + 0.01
  sequencer.processTick()
  expect(notes).toContainEqual([144, 67, 0])
  expect(measureSeekProgress(0, midi.duration)).toBe(0)
})
