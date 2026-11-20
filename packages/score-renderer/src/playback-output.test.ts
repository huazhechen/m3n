import { afterEach, expect, test, vi } from 'vitest'
import { createPlaybackOutput } from './playback-output'
import { PLAYBACK_TONE_GAIN } from './tone-levels'

afterEach(() => vi.unstubAllGlobals())
test('keeps unity gain before mastering when switching tones', () => {
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
  expect(input.gain.value).toBe(1)
  expect(input.connect).toHaveBeenCalledWith(highpass)
  expect(highpass.connect).toHaveBeenCalledWith(compressor)
  expect(compressor.connect).toHaveBeenCalledWith(makeup)
  expect(makeup.connect).toHaveBeenCalledWith(limiter)
  expect(limiter.connect).toHaveBeenCalledWith(context.destination)
  expect(makeup.gain.value).toBe(1)
  output.setTone('guitar')
  expect(input.gain.setTargetAtTime).toHaveBeenCalledWith(1, 10, 0.02)
  expect(Object.values(PLAYBACK_TONE_GAIN).every(gain => gain === 1)).toBe(true)
})
