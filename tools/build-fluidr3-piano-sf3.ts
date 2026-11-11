import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core'
import { encodeVorbis } from '../.tmp/SpessaSynth/src/externals/encode_vorbis.ts'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourcePath = resolve(root, 'public/soundfonts/FluidR3_GM.sf2')
const outputPath = resolve(root, 'public/soundfonts/FluidR3_GM-Piano.sf3')

try {
  await access(sourcePath)
} catch {
  throw new Error('Missing FluidR3_GM.sf2. Run `npm run download:fluidr3` before building.')
}

const sourceData = await readFile(sourcePath)
const source = SoundBankLoader.fromArrayBuffer(
  sourceData.buffer.slice(sourceData.byteOffset, sourceData.byteOffset + sourceData.byteLength),
)
const piano = source.presets.find((preset) => preset.program === 0 && preset.bankMSB === 0 && preset.bankLSB === 0)

if (!piano) throw new Error('FluidR3_GM.sf2 does not contain GM Program 0 (Acoustic Grand Piano).')

const bank = new BasicSoundBank('sf2')
bank.clonePreset(piano)
bank.soundBankInfo.name = 'FluidR3 GM Grand Piano'
bank.soundBankInfo.comment = 'GM Program 0 extracted from FluidR3_GM.sf2 and encoded as SF3 with SpessaSynth Vorbis quality 0.6.'
bank.soundBankInfo.software = 'SpessaSynth'
bank.soundBankInfo.creationDate = new Date()
await bank.setSampleFormat({
  format: 'compressed',
  compressionFunction: (audioData, sampleRate) => encodeVorbis(audioData, sampleRate, 0.6),
})
bank.flush()
await writeFile(outputPath, Buffer.from(bank.writeSF2({ software: 'SpessaSynth' })))

console.log(`Wrote ${outputPath}: ${bank.presets.length} preset, ${bank.instruments.length} instrument, ${bank.samples.length} samples.`)
