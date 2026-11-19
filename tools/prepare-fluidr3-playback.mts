import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core'

// First run measure-fluidr3-tones.mts on the original PCM SF2. Preserve its q3
// Vorbis payloads; remap each preset to Program 0 used by the score's MIDI.
const source = resolve(process.argv[2] ?? '.tmp/fluidr3-tones')
const output = resolve('packages/score-renderer/vendor/soundfonts')
await BasicSoundBank.isSF3DecoderReady
await mkdir(output, { recursive: true })
for (const tone of ['piano', 'harmonica', 'guitar', 'violin', 'flute']) {
  const data = await readFile(resolve(source, `${tone}.q3.sf3`))
  const bank = SoundBankLoader.fromArrayBuffer(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  assert.equal(bank.presets.length, 1)
  const payloads = bank.samples.map(sample => Buffer.from(sample.getRawData(true)))
  bank.presets[0]!.program = 0
  bank.flush()
  const bytes = bank.writeSF2()
  const verified = SoundBankLoader.fromArrayBuffer(bytes)
  assert.equal(verified.presets[0]!.program, 0)
  for (const [index, sample] of verified.samples.entries()) assert.deepEqual(Buffer.from(sample.getRawData(true)), payloads[index])
  await writeFile(resolve(output, `FluidR3-${tone}-q3.sf3`), new Uint8Array(bytes))
  console.log(`${tone}: ${bytes.byteLength} bytes`)
}
