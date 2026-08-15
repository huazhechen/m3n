import type { BasicMIDI } from 'spessasynth_core'

const LOOK_AHEAD_SECONDS = 0.16
const SCHEDULER_INTERVAL_MILLISECONDS = 25

export type MetronomeBeat = { time: number; accent: boolean }

type TempoPoint = { ticks: number; tempo: number }
type MeterPoint = { ticks: number; numerator: number; denominator: number }

function sortedTempoPoints(midi: BasicMIDI): TempoPoint[] {
  const points = midi.tempoChanges
    .filter((point) => Number.isFinite(point.ticks) && point.ticks >= 0 && Number.isFinite(point.tempo) && point.tempo > 0)
    .sort((left, right) => left.ticks - right.ticks)
  if (points[0]?.ticks !== 0) points.unshift({ ticks: 0, tempo: 120 })
  return points.filter((point, index) => index === 0 || point.ticks !== points[index - 1]?.ticks)
}

function sortedMeterPoints(midi: BasicMIDI): MeterPoint[] {
  const points = midi.tracks.flatMap((track) => track.events)
    .filter((event) => event.statusByte === 0x58 && event.data.length >= 2)
    .map((event) => ({
      ticks: event.ticks,
      numerator: event.data[0] ?? 4,
      denominator: 2 ** (event.data[1] ?? 2),
    }))
    .filter((point) => point.ticks >= 0 && point.numerator > 0 && Number.isSafeInteger(point.numerator)
      && point.denominator > 0 && Number.isSafeInteger(point.denominator))
    .sort((left, right) => left.ticks - right.ticks)
  if (points[0]?.ticks !== 0) points.unshift({ ticks: 0, numerator: 4, denominator: 4 })
  return points.filter((point, index) => index === 0 || point.ticks !== points[index - 1]?.ticks)
}

function secondsAtTick(tick: number, timeDivision: number, tempos: readonly TempoPoint[]) {
  let seconds = 0
  let previousTick = 0
  let tempo = tempos[0]?.tempo ?? 120
  for (const point of tempos) {
    if (point.ticks >= tick) break
    seconds += (point.ticks - previousTick) * 60 / (tempo * timeDivision)
    previousTick = point.ticks
    tempo = point.tempo
  }
  return seconds + (tick - previousTick) * 60 / (tempo * timeDivision)
}

/** Builds accented beat positions from the expanded MIDI sequence. */
export function buildMetronomeBeats(midi: BasicMIDI): MetronomeBeat[] {
  if (!Number.isFinite(midi.timeDivision) || midi.timeDivision <= 0 || midi.duration <= 0) return []
  const tempos = sortedTempoPoints(midi)
  const meters = sortedMeterPoints(midi)
  const endTick = Math.max(midi.lastVoiceEventTick, ...midi.tracks.flatMap((track) => track.events.map((event) => event.ticks)))
  const beats: MetronomeBeat[] = []

  for (let index = 0; index < meters.length; index += 1) {
    const meter = meters[index]
    if (!meter) continue
    const nextMeterTick = meters[index + 1]?.ticks ?? endTick + 1
    const ticksPerBeat = midi.timeDivision * 4 / meter.denominator
    if (!Number.isFinite(ticksPerBeat) || ticksPerBeat <= 0) continue
    for (let tick = meter.ticks, beat = 0; tick < nextMeterTick; tick += ticksPerBeat, beat += 1) {
      const time = secondsAtTick(tick, midi.timeDivision, tempos)
      if (time <= midi.duration + 0.001) beats.push({ time, accent: beat % meter.numerator === 0 })
    }
  }
  return beats
}

/** Schedules synthetic clicks against an existing playback audio clock. */
export class Metronome {
  private timer = 0
  private nextBeatIndex = 0
  private anchorAudioTime = 0
  private anchorPlaybackTime = 0
  private playbackRate = 1
  private readonly scheduled = new Set<OscillatorNode>()

  constructor(private readonly context: AudioContext, private readonly beats: readonly MetronomeBeat[]) {}

  start(playbackTime: number, playbackRate: number) {
    this.stop()
    this.anchorAudioTime = this.context.currentTime
    this.anchorPlaybackTime = Math.max(0, playbackTime)
    this.playbackRate = Math.max(0.01, playbackRate)
    this.nextBeatIndex = this.findNextBeat(this.anchorPlaybackTime)
    this.schedule()
  }

  stop() {
    window.clearTimeout(this.timer)
    this.timer = 0
    this.scheduled.forEach((oscillator) => oscillator.stop())
    this.scheduled.clear()
  }

  private findNextBeat(playbackTime: number) {
    let low = 0
    let high = this.beats.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if ((this.beats[middle]?.time ?? Infinity) < playbackTime - 0.003) low = middle + 1
      else high = middle
    }
    return low
  }

  private schedule = () => {
    const now = this.context.currentTime
    const horizon = now + LOOK_AHEAD_SECONDS
    while (this.nextBeatIndex < this.beats.length) {
      const beat = this.beats[this.nextBeatIndex]
      if (!beat) break
      const at = this.anchorAudioTime + (beat.time - this.anchorPlaybackTime) / this.playbackRate
      if (at > horizon) break
      this.nextBeatIndex += 1
      if (at >= now - 0.003) this.click(beat.accent, Math.max(now, at))
    }
    if (this.nextBeatIndex < this.beats.length) this.timer = window.setTimeout(this.schedule, SCHEDULER_INTERVAL_MILLISECONDS)
  }

  private click(accent: boolean, at: number) {
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(accent ? 1760 : 1175, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.14 : 0.09, at + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045)
    oscillator.connect(gain)
    gain.connect(this.context.destination)
    oscillator.addEventListener('ended', () => {
      this.scheduled.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    })
    this.scheduled.add(oscillator)
    oscillator.start(at)
    oscillator.stop(at + 0.05)
  }
}
