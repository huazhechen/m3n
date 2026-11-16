import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BasicSoundBank, GeneratorTypes, SoundBankLoader } from 'spessasynth_core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
// Requires Python 3 + libsndfile, or FFMPEG_PATH pointing to FFmpeg with libvorbis.
// Input may be the full SF2 or original piano SF3.
const sourcePath = resolve(process.argv[2] ?? resolve(root, 'public/soundfonts/FluidR3_GM.sf2'))
const outputPath = resolve(process.argv[3] ?? resolve(root, 'packages/score-renderer/vendor/soundfonts/FluidR3_GM-Piano.sf3'))
assert.notEqual(sourcePath, outputPath, 'Keep the source bank separate from the output.')
const ffmpeg = process.env.FFMPEG_PATH

const sourceData = await readFile(sourcePath)
const source = SoundBankLoader.fromArrayBuffer(
  sourceData.buffer.slice(sourceData.byteOffset, sourceData.byteOffset + sourceData.byteLength),
)
await BasicSoundBank.isSF3DecoderReady
const piano = source.presets.find((preset) => preset.program === 0 && preset.bankMSB === 0 && preset.bankLSB === 0)

if (!piano) throw new Error('FluidR3_GM.sf2 does not contain GM Program 0 (Acoustic Grand Piano).')

const bank = new BasicSoundBank('sf2')
bank.clonePreset(piano)
bank.soundBankInfo = { ...source.soundBankInfo }
bank.soundBankInfo.name = 'FluidR3 GM Piano Mono'
bank.soundBankInfo.comment = 'GM Program 0; stereo pairs mixed to mono, original sample rate and loops retained; Ogg Vorbis quality 1.'
bank.soundBankInfo.software = 'm3n build-fluidr3-piano-sf3'

for (const instrument of bank.instruments) {
  const leftZones = instrument.zones.filter((zone) => zone.sample.name.endsWith('(L)'))
  assert.equal(leftZones.length * 2, instrument.zones.length, 'Expected paired stereo zones.')
  for (const left of leftZones) {
    const sample = left.sample
    const right = instrument.zones.find((zone) => zone.sample.name === sample.name.replace(/\(L\)$/, '(R)'))
    assert(right, `Missing right channel for ${sample.name}`)
    assert.deepEqual(left.keyRange, right.keyRange)
    assert.deepEqual(left.velRange, right.velRange)
    assert.equal(sample.sampleRate, right.sample.sampleRate)
    assert.equal(sample.loopStart, right.sample.loopStart)
    assert.equal(sample.loopEnd, right.sample.loopEnd)
    const l = sample.getAudioData()
    const r = right.sample.getAudioData()
    assert.equal(l.length, r.length)
    // Average both channels without clipping.
    const mono = Float32Array.from(l, (value, index) => (value + r[index]) / 2)
    assert(mono.every((value) => Number.isFinite(value) && Math.abs(value) <= 1), 'Mono mix clips.')
    const args = ffmpeg ? [
      '-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(sample.sampleRate),
      '-ac', '1', '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '1', '-f', 'ogg', 'pipe:1',
    ] : [resolve(root, 'tools/encode-vorbis.py'), String(sample.sampleRate)]
    const ogg = execFileSync(ffmpeg ?? 'python3', args,
      { input: Buffer.from(mono.buffer), maxBuffer: 16 * 1024 * 1024 })
    sample.setCompressedData(ogg)
    sample.name = sample.name.replace(/\(L\)$/, '(M)')
    left.setGenerator(GeneratorTypes.pan, 0)
    instrument.deleteZone(instrument.zones.indexOf(right), true)
  }
}
bank.removeUnusedElements()
bank.flush()
const output = Buffer.from(bank.writeSF2({ software: bank.soundBankInfo.software }))
// Decode every sample and check loop bounds before replacing the shipped asset.
const verified = SoundBankLoader.fromArrayBuffer(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength))
assert.equal(verified.presets.length, 1)
assert.equal(verified.samples.length, 20)
for (const sample of verified.samples) {
  const audio = sample.getAudioData()
  assert(audio.every(Number.isFinite))
  assert(sample.loopStart >= 0 && sample.loopStart < sample.loopEnd && sample.loopEnd <= audio.length)
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, output)

console.log(`Wrote ${outputPath}: ${output.length} bytes; ${verified.samples.length} mono samples.`)
