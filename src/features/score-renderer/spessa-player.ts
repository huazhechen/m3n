import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import { BasicMIDI, IndexedByteArray, MIDIBuilder, MIDIMessage, MIDIMessageTypes } from 'spessasynth_core'
import type { AccompanimentNote, TempoChange } from '../../lib/m3n-playback'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

const soundFont = { name: 'FluidR3-GM-Piano-SF3', url: '/soundfonts/FluidR3_GM-Piano.sf3' } as const
const pianoPatch = { program: 0, bankMSB: 0, bankLSB: 0, isGMGSDrum: false }

export function prepareScoreMidi(midi: ArrayBuffer, tempoChanges: TempoChange[]) {
  const sequence = BasicMIDI.fromArrayBuffer(midi)
  const conductorTrack = sequence.tracks[0]
  if (!conductorTrack) throw new Error('MIDI 缺少导体轨道。')
  for (let index = conductorTrack.events.length - 1; index >= 0; index -= 1) {
    if (conductorTrack.events[index]?.statusByte === MIDIMessageTypes.endOfTrack) conductorTrack.deleteEvent(index)
  }
  for (const change of tempoChanges) {
    if (!change.ramp) continue
    const microsecondsPerBeat = Math.round(60_000_000 / change.tempo)
    conductorTrack.pushEvent(new MIDIMessage(
      Math.round(change.startBeats * sequence.timeDivision),
      MIDIMessageTypes.setTempo,
      new IndexedByteArray([
        microsecondsPerBeat >> 16 & 0xff,
        microsecondsPerBeat >> 8 & 0xff,
        microsecondsPerBeat & 0xff,
      ]),
    ))
  }
  sequence.modify({
    channels: new Map(Array.from({ length: 16 }, (_, channel) => [channel, { patch: pianoPatch }])),
  })
  sequence.flush()
  return sequence.writeMIDI()
}

export function sourceTimeAt(playbackMidi: BasicMIDI, sourceMidi: BasicMIDI, playbackSeconds: number) {
  return sourceMidi.midiTicksToSeconds(playbackMidi.secondsToMIDITicks(playbackSeconds))
}

export function seekTimeAtProgress(duration: number, progress: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const normalized = Math.max(0, Math.min(1, progress))
  // SpessaSynth cannot seek to the exact end because there is no next event.
  return Math.min(normalized * duration, Math.max(0, duration - 0.001))
}

function accompanimentMidi(notes: AccompanimentNote[], tempo: number, tempoChanges: TempoChange[]) {
  const sequence = new MIDIBuilder({ format: 1, initialTempo: tempo, name: 'M3N accompaniment' })
  sequence.addTrack('M3N accompaniment')
  const track = sequence.tracks.length - 1
  sequence.programChange(0, track, 1, 0)
  for (const change of tempoChanges) {
    sequence.setTempo(Math.round(change.startBeats * sequence.timeDivision), change.tempo)
  }
  for (const note of notes) {
    const start = Math.round(note.startBeats * sequence.timeDivision)
    const end = Math.round((note.startBeats + note.durationBeats) * sequence.timeDivision)
    sequence.noteOn(start, track, 1, note.midi, note.velocity)
    sequence.noteOff(end, track, 1, note.midi)
  }
  return sequence.writeMIDI()
}

export type PlayerListener = {
  onEnded: () => void
  onTime: (seconds: number, duration: number, sourceSeconds: number) => void
}

export class SpessaPlayer {
  private animationFrame = 0
  private readonly context: AudioContext
  private readonly synth: WorkletSynthesizer
  private readonly sequencer: Sequencer
  private readonly accompanimentSequencer: Sequencer | null
  private readonly playbackMidi: BasicMIDI
  private readonly sourceMidi: BasicMIDI
  private readonly listener: PlayerListener
  readonly soundFontName: string

  private constructor(context: AudioContext, synth: WorkletSynthesizer, sequencer: Sequencer, accompanimentSequencer: Sequencer | null, playbackMidi: BasicMIDI, sourceMidi: BasicMIDI, listener: PlayerListener, soundFontName: string) {
    this.context = context
    this.synth = synth
    this.sequencer = sequencer
    this.accompanimentSequencer = accompanimentSequencer
    this.playbackMidi = playbackMidi
    this.sourceMidi = sourceMidi
    this.listener = listener
    this.soundFontName = soundFontName
    this.sequencer.eventHandler.addEvent('songEnded', 'm3n-player', () => {
      this.stopProgressLoop()
      this.listener.onTime(this.sequencer.duration, this.sequencer.duration, this.sourceTimeAt(this.sequencer.duration))
      this.listener.onEnded()
    })
  }

  static async create(midi: ArrayBuffer, accompaniment: AccompanimentNote[], tempo: number, tempoChanges: TempoChange[], listener: PlayerListener) {
    const response = await fetch(soundFont.url)
    if (!response.ok) throw new Error(`无法加载 ${soundFont.name} 音色文件。`)
    const soundBank = await response.arrayBuffer()
    const context = new AudioContext()
    await context.audioWorklet.addModule(processorUrl)
    const synth = new WorkletSynthesizer(context)
    synth.connect(context.destination)
    await synth.soundBankManager.addSoundBank(soundBank, soundFont.name)
    await synth.isReady
    const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
    const preparedMidi = prepareScoreMidi(midi, tempoChanges)
    const playbackMidi = BasicMIDI.fromArrayBuffer(preparedMidi)
    const sourceMidi = BasicMIDI.fromArrayBuffer(midi)
    sequencer.loadNewSongList([{ binary: preparedMidi, fileName: 'm3n-score.mid' }])
    const accompanimentSequencer = accompaniment.length > 0 ? new Sequencer(synth, { skipToFirstNoteOn: false }) : null
    accompanimentSequencer?.loadNewSongList([{ binary: accompanimentMidi(accompaniment, tempo, tempoChanges), fileName: 'm3n-accompaniment.mid' }])
    return new SpessaPlayer(context, synth, sequencer, accompanimentSequencer, playbackMidi, sourceMidi, listener, soundFont.name)
  }

  get paused() {
    return this.sequencer.paused
  }

  get duration() {
    return this.sequencer.duration
  }

  sourceTimeAt(playbackSeconds: number) {
    return sourceTimeAt(this.playbackMidi, this.sourceMidi, playbackSeconds)
  }

  async play() {
    await this.context.resume()
    this.sequencer.play()
    this.accompanimentSequencer?.play()
    this.startProgressLoop()
  }

  pause() {
    this.sequencer.pause()
    this.accompanimentSequencer?.pause()
    this.stopProgressLoop()
  }

  seek(progress: number) {
    this.sequencer.currentTime = seekTimeAtProgress(this.sequencer.duration, progress)
    if (this.accompanimentSequencer) this.accompanimentSequencer.currentTime = seekTimeAtProgress(this.accompanimentSequencer.duration, progress)
    this.emitProgress()
  }

  setSpeed(percent: number) {
    this.sequencer.playbackRate = percent / 100
    if (this.accompanimentSequencer) this.accompanimentSequencer.playbackRate = percent / 100
  }

  destroy() {
    this.stopProgressLoop()
    this.sequencer.pause()
    this.accompanimentSequencer?.pause()
    this.synth.destroy()
    void this.context.close()
  }

  private emitProgress = () => {
    const playbackSeconds = this.sequencer.currentHighResolutionTime
    this.listener.onTime(playbackSeconds, this.sequencer.duration, this.sourceTimeAt(playbackSeconds))
  }

  private startProgressLoop() {
    this.stopProgressLoop()
    const tick = () => {
      this.emitProgress()
      this.animationFrame = requestAnimationFrame(tick)
    }
    this.animationFrame = requestAnimationFrame(tick)
  }

  private stopProgressLoop() {
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
  }
}
