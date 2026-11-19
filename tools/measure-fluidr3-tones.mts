import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'

// Extract original presets without downmixing, resampling, trimming, or changing
// envelopes. Outputs are a measurement workspace, not automatically published.
const root = fileURLToPath(new URL('..', import.meta.url))
const input = resolve(process.argv[2] ?? '.tmp/soundfonts/FluidR3_GM.sf2')
const directory = resolve(process.argv[3] ?? '.tmp/fluidr3-tones')
const bytes = await readFile(input)
const source = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
assert(source.samples.every(sample => !sample.isCompressed), 'Use the original PCM SF2 to compare compression sizes without re-encoding losses.')
await BasicSoundBank.isSF3DecoderReady
await mkdir(directory, { recursive: true })
const tones = [
  { tone: 'piano', label: '钢琴', program: 0 },
  { tone: 'harmonica', label: '口琴', program: 22 },
  { tone: 'guitar', label: '钢弦吉他', program: 25 },
  { tone: 'violin', label: '小提琴', program: 40 },
  { tone: 'flute', label: '长笛', program: 73 },
]
const measurements: object[] = []
const selected = process.argv.slice(4)
assert(selected.every(tone => tones.some(item => item.tone === tone)), 'Unknown tone name')
for (const tone of tones.filter(tone => selected.length === 0 || selected.includes(tone.tone))) {
  const preset = source.presets.find(p => p.program === tone.program && p.bankMSB === 0 && p.bankLSB === 0 && !p.isGMGSDrum)
  assert(preset, `Missing GM preset ${tone.program}`)
  const sizes: Record<string, number> = {}
  let samples = 0
  for (const quality of [undefined, 0.1, 0.3]) {
    const bank = new BasicSoundBank('sf2')
    bank.clonePreset(preset)
    bank.soundBankInfo = { ...source.soundBankInfo }
    bank.soundBankInfo.name = `FluidR3 ${tone.tone}`
    bank.soundBankInfo.comment = `${preset.name}; original samples, stereo, loops and envelopes; ${quality === undefined ? 'PCM' : `Vorbis q${quality * 10}`}.`
    bank.removeUnusedElements()
    bank.flush()
    samples = bank.samples.length
    if (quality !== undefined) for (const sample of bank.samples) {
      const audio = sample.getAudioData()
      assert(audio.every(Number.isFinite) && audio.some(value => value !== 0), `Invalid source sample ${sample.name}`)
      const encoded = execFileSync('python3', [resolve(root, 'tools/encode-vorbis.py'), String(sample.sampleRate), String(quality)], {
        input: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength), maxBuffer: 16 * 1024 * 1024,
      })
      sample.setCompressedData(encoded)
    }
    const format = quality === undefined ? 'sf2' : `q${quality * 10}.sf3`
    const output = bank.writeSF2()
    const verified = SoundBankLoader.fromArrayBuffer(output)
    assert.equal(verified.presets.length, 1)
    assert.equal(verified.samples.length, samples)
    for (const sample of verified.samples) {
      const audio = sample.getAudioData()
      assert(audio.every(Number.isFinite) && audio.some(value => value !== 0))
      assert(sample.loopStart >= 0 && sample.loopStart < sample.loopEnd && sample.loopEnd <= audio.length, `Invalid loop ${sample.name}`)
    }
    // Verify the extracted bank actually sounds across the common melody range.
    const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
    await synth.processorInitialized
    try {
      synth.soundBankManager.addSoundBank(verified, tone.tone)
      synth.programChange(0, tone.program)
      for (const key of [48, 60, 72]) {
        synth.stopAllChannels(true)
        synth.noteOn(0, key, 127)
        const left = new Float32Array(128), right = new Float32Array(128)
        let energy = 0
        for (let block = 0; block < 700; block++) {
          left.fill(0); right.fill(0)
          synth.process(left, right)
          assert(left.every(Number.isFinite) && right.every(Number.isFinite))
          energy += left.reduce((sum, value) => sum + value * value, 0)
        }
        assert(energy > 0.001, `Silent ${tone.tone} ${key}`)
      }
    } finally { synth.destroySynthProcessor() }
    await writeFile(resolve(directory, `${tone.tone}.${format}`), new Uint8Array(output))
    sizes[format] = output.byteLength
  }
  const result = { ...tone, preset: preset.name, samples, bytes: sizes }
  measurements.push(result)
  console.log(JSON.stringify(result))
}
await writeFile(resolve(directory, 'sizes.json'), JSON.stringify({ source: source.soundBankInfo.name, measurements }, null, 2) + '\n')
