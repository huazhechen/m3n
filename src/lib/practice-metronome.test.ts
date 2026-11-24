import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PracticeMetronome } from './practice-metronome'

class FakeSource {
  buffer!: { duration: number; getChannelData: () => Float32Array }
  loop = false
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}
class FakeContext {
  static latest: FakeContext
  currentTime = 0
  sampleRate = 48000
  state = 'suspended'
  destination = {}
  sources: FakeSource[] = []
  onstatechange: (() => void) | null = null
  constructor() { FakeContext.latest = this }
  async resume() { this.state = 'running' }
  async close() { this.state = 'closed' }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length)
    return { duration: length / rate, getChannelData: () => data }
  }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source }
}
beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

it('keeps an entire accented bar looping without JS timers or animation callbacks', async () => {
  const beat = vi.fn()
  const engine = new PracticeMetronome({ bpm: 120, accents: [true, false, true] }, beat)
  await engine.start()
  const context = FakeContext.latest
  const source = context.sources[0]!
  expect(source.loop).toBe(true)
  expect(source.buffer.duration).toBe(1.5)
  const data = source.buffer.getChannelData()
  for (const [offset, frequency] of [[0, 1500], [24000, 900], [48000, 1500]]) {
    expect(data[offset! + 503]).toBeCloseTo(Math.sin(2 * Math.PI * frequency! * (503 / context.sampleRate)), 5)
    expect(data[offset! + 5000]).toBe(0)
  }
  // Simulate a minute without any main-thread callback: audio keeps looping.
  context.currentTime = 60.03
  expect(engine.elapsedSeconds).toBeCloseTo(60)
  expect(context.sources).toHaveLength(1)
  expect(source.stop).not.toHaveBeenCalled()
  engine.stop()
  expect(source.stop).toHaveBeenCalledOnce()
  expect(engine.running).toBe(false)
})

it('switches tempo on the next audible beat, replaces queued edits and resets new meters', async () => {
  const engine = new PracticeMetronome({ bpm: 120, accents: [true, false, false, false] }, vi.fn())
  await engine.start()
  const context = FakeContext.latest
  context.currentTime = .2
  engine.update({ bpm: 240, accents: [true, false, false, false] })
  expect(context.sources[1]!.start).toHaveBeenCalledWith(.53, .25)
  expect(context.sources[0]!.stop).toHaveBeenLastCalledWith(.53)
  engine.update({ bpm: 180, accents: [true, false, false] })
  expect(context.sources[1]!.stop).toHaveBeenCalledWith()
  expect(context.sources[2]!.start).toHaveBeenCalledWith(.53, 0)
  context.currentTime = .7
  engine.update({ bpm: 180, accents: [false, true, false] })
  expect(context.sources[3]!.start).toHaveBeenCalledWith(.53 + 1 / 3, 1 / 3)
  engine.stop()
})

it('reports audio interruption immediately and does not count suspended wall time', async () => {
  const interrupted = vi.fn()
  const engine = new PracticeMetronome({ bpm: 60, accents: [true, false] }, vi.fn(), interrupted)
  await engine.start()
  const context = FakeContext.latest
  context.currentTime = 2.03
  context.state = 'suspended'
  context.onstatechange!()
  expect(interrupted).toHaveBeenCalledOnce()
  expect(engine.running).toBe(false)
  expect(engine.elapsedSeconds).toBeCloseTo(2)
  engine.stop()
  expect(context.onstatechange).toBeNull()
})
