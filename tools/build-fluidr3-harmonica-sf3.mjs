import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core'

// FluidR3Mono 2.312 from MuseScore v2.3.2, pinned by Git blob hash.
const sourceBlob = '555bf79687570ad7ea9d4aba6cb5bfbc1724cdb2'
const sourceUrl = `https://api.github.com/repos/musescore/MuseScore/git/blobs/${sourceBlob}`
const root = new URL('..', import.meta.url).pathname
const outputPath = resolve(process.argv[3] ?? resolve(root, 'packages/score-renderer/vendor/soundfonts/FluidR3_GM-Harmonica.sf3'))

async function fetchSource() {
  const response = await fetch(sourceUrl, {
    headers: { Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) throw new Error(`Source download failed: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const data = bytes[0] === 123 ? Buffer.from(JSON.parse(bytes.toString()).content, 'base64') : bytes
  assert.equal(createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'), sourceBlob)
  return data
}

const sourceData = process.argv[2] ? await readFile(process.argv[2]) : await fetchSource()
const source = SoundBankLoader.fromArrayBuffer(sourceData.buffer.slice(sourceData.byteOffset, sourceData.byteOffset + sourceData.byteLength))
await BasicSoundBank.isSF3DecoderReady
const preset = source.presets.find(p => p.program === 22 && p.bankMSB === 0 && p.bankLSB === 0)
assert(preset, 'No GM Program 22 (Harmonica)')
const bank = new BasicSoundBank('sf2')
const selected = bank.clonePreset(preset)
// All score channels use program zero. A single-instrument bank maps its tone there.
selected.program = 0
for (const instrument of bank.instruments) {
  const highest = Math.max(...instrument.zones.map(zone => zone.keyRange.max))
  for (const zone of instrument.zones) {
    if (zone.keyRange.max === highest) zone.keyRange.max = 127
  }
}
bank.soundBankInfo = { ...source.soundBankInfo, name: 'FluidR3 GM Harmonica',
  comment: `FluidR3Mono 2.312 Program 22 (Harmonica), mapped to Program 0 for score playback; highest key zone extended to MIDI 127; Vorbis quality 1.\nSource: ${sourceUrl}\n\n${await readFile(resolve(root, 'packages/score-renderer/vendor/soundfonts/FluidR3Mono-LICENSE.md'), 'utf8')}` }
for (const sample of bank.samples) {
  const audio = sample.getAudioData()
  const ogg = execFileSync('python3', [resolve(root, 'tools/encode-vorbis.py'), String(sample.sampleRate)], {
    input: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength), maxBuffer: 16 * 1024 * 1024,
  })
  sample.setCompressedData(ogg)
}
bank.flush()
const output = Buffer.from(bank.writeSF2())
const check = SoundBankLoader.fromArrayBuffer(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength))
for (const sample of check.samples) {
  const audio = sample.getAudioData()
  assert(audio.every(Number.isFinite))
  assert(sample.loopStart >= 0 && sample.loopStart < sample.loopEnd && sample.loopEnd <= audio.length)
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, output)
console.log(`Wrote ${outputPath}: ${output.length} bytes, ${bank.samples.length} samples; source preset ${preset.name}`)
