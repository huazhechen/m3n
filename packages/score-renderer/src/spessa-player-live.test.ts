import { MIDIBuilder } from 'spessasynth_core'
import { afterEach, expect, it, vi } from 'vitest'
import { SpessaPlayer } from './spessa-player'

vi.mock('./playback-output.js', () => ({ createPlaybackOutput: () => ({ input: {}, setTone: mocks.outputTone }) }))
const mocks = vi.hoisted(() => ({
  tune: vi.fn(), pause: vi.fn(), load: vi.fn(), close: vi.fn(), generate: vi.fn(), outputTone: vi.fn(),
  manager: { priorityOrder: ['synth'], addSoundBank: vi.fn(async (_data: ArrayBuffer, id: string) => { mocks.manager.priorityOrder.push(id) }) },
}))
vi.mock('spessasynth_lib', () => ({
  WorkletSynthesizer: class {
    soundBankManager = mocks.manager
    isReady = Promise.resolve()
    connect() {}
    setSystemParameter = mocks.tune
  },
  Sequencer: class {
    ready: (() => void) | undefined
    eventHandler = {
      addEvent: (name: string, _id: string, callback: () => void) => { if (name === 'timeChange') this.ready = callback },
      removeEvent() {},
    }
    loadNewSongList = (...args: unknown[]) => { mocks.load(...args); void Promise.resolve().then(() => this.ready?.()) }
    pause = mocks.pause
    currentHighResolutionTime = 5
    paused = false
    duration = 20
  },
}))
vi.mock('./playback-tones.js', () => ({ loadSampledTone: mocks.generate }))
vi.mock('./synthetic-soundfont.js', () => ({ createSyntheticSoundFont: () => new ArrayBuffer(1) }))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); mocks.manager.priorityOrder = ['synth'] })
async function player() {
  vi.stubGlobal('AudioContext', class {
    destination = {}; audioWorklet = { addModule: async () => {} }; close = mocks.close
  })
  const midi = new MIDIBuilder(); midi.noteOn(0, 0, 0, 60, 100); midi.noteOff(480, 0, 0, 60)
  const result = await SpessaPlayer.create(midi.writeMIDI(), { onEnded() {}, onTime() {} })
  mocks.manager.priorityOrder = ['synth']
  mocks.load.mockClear(); mocks.tune.mockClear()
  return result
}
it('live transpose changes sustained voice tuning without replacing or pausing the sequence', async () => {
  const instance = await player()
  instance.setTranspose(5); instance.setTranspose(-12)
  expect(mocks.tune.mock.calls).toEqual([['fineTune', 500], ['fineTune', -1200]])
  expect(instance.paused).toBe(false)
  expect(mocks.pause).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled()
})
it('keeps the current bank during a pending download and ignores a superseded tone', async () => {
  const instance = await player()
  let finish!: (data: ArrayBuffer) => void
  mocks.generate.mockReturnValueOnce(new Promise<ArrayBuffer>(resolve => { finish = resolve }))
  const pending = instance.setTone('piano')
  expect(mocks.manager.priorityOrder[0]).toBe('synth')
  expect(instance.paused).toBe(false)
  await instance.setTone('synth')
  finish(new ArrayBuffer(1)); await pending
  expect(mocks.manager.priorityOrder[0]).toBe('synth')
  expect(mocks.outputTone.mock.calls).toEqual([['synth']])
  await instance.setTone('piano')
  expect(mocks.manager.priorityOrder[0]).toBe('piano')
  expect(mocks.outputTone).toHaveBeenLastCalledWith('piano')
  expect(mocks.generate).toHaveBeenCalledTimes(1)
  expect(mocks.pause).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled()
})
