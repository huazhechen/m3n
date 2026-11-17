import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StartupCue } from './startup-cue.js'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const setup = () => {
  const starts: number[] = []
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} })
  const context = {
    get currentTime() { return Date.now() / 1000 }, destination: {},
    createOscillator: () => ({ frequency: parameter(), connect() {}, disconnect() {}, addEventListener() {}, start(at: number) { starts.push(at) }, stop() {} }),
    createGain: () => ({ gain: parameter(), connect() {}, disconnect() {} }),
  } as unknown as AudioContext
  return { cue: new StartupCue(context), starts }
}
it('schedules exactly three equally timed pulses and ends on the following beat', async () => {
  const { cue, starts } = setup(), listener = vi.fn()
  const playing = cue.play(120, listener)
  expect(listener).toHaveBeenLastCalledWith(1)
  await vi.advanceTimersByTimeAsync(1500); await playing
  expect(starts).toEqual([0, 0.5, 1])
  expect(listener.mock.calls.map(([beat]) => beat)).toEqual([1, 2, 3, null])
  expect(cue.active).toBe(false)
})
it('cancels scheduled sound and visual pulses without completing later', async () => {
  const { cue } = setup(), listener = vi.fn()
  const playing = cue.play(60, listener)
  cue.cancel(); await playing
  await vi.advanceTimersByTimeAsync(4000)
  expect(listener.mock.calls.map(([beat]) => beat)).toEqual([1, null])
})
it('changes tempo using the elapsed audio beat rather than restarting the three pulses', async () => {
  const { cue } = setup(), listener = vi.fn()
  const playing = cue.play(60, listener)
  await vi.advanceTimersByTimeAsync(500)
  cue.setTempo(120)
  await vi.advanceTimersByTimeAsync(1250); await playing
  expect(listener.mock.calls.map(([beat]) => beat)).toEqual([1, 2, 3, null])
})
