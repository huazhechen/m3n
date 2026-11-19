import { afterEach, expect, test, vi } from 'vitest'
import { createPlaybackOutput } from './playback-output'
import { PLAYBACK_TONE_GAIN } from './tone-levels'

afterEach(() => vi.unstubAllGlobals())
test('applies fixed tone gain before mastering, with smooth live updates', () => {
  const parameter = () => ({ value: 0, setTargetAtTime: vi.fn() })
  const node = () => ({ connect: vi.fn() })
  const input = { ...node(), gain: parameter() }
  const makeup = { ...node(), gain: parameter() }
  const compressor = { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() }
  const highpass = { ...node(), type: '', frequency: parameter(), Q: parameter() }
  const context = {
    currentTime: 10, destination: {},
    createGain: vi.fn().mockReturnValueOnce(input).mockReturnValueOnce(makeup),
    createBiquadFilter: () => highpass,
    createDynamicsCompressor: () => compressor,
  }
  const limiter = node()
  vi.stubGlobal('AudioWorkletNode', class { constructor() { return limiter } })
  const output = createPlaybackOutput(context as unknown as AudioContext, 'piano')
  expect(output.input).toBe(input)
  expect(output.metronomeInput).toBe(limiter)
  expect(input.gain.value).toBe(PLAYBACK_TONE_GAIN.piano)
  expect(input.connect).toHaveBeenCalledWith(highpass)
  expect(highpass.connect).toHaveBeenCalledWith(compressor)
  expect(compressor.connect).toHaveBeenCalledWith(makeup)
  expect(makeup.connect).toHaveBeenCalledWith(limiter)
  expect(limiter.connect).toHaveBeenCalledWith(context.destination)
  expect(makeup.gain.value).toBe(2)
  output.setTone('guitar')
  expect(input.gain.setTargetAtTime).toHaveBeenCalledWith(PLAYBACK_TONE_GAIN.guitar, 10, 0.02)
})
