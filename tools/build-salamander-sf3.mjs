import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BasicInstrument,
  BasicPreset,
  BasicSample,
  BasicSoundBank,
  SampleTypes,
} from 'spessasynth_core'

const root = new URL('..', import.meta.url).pathname
const cacheDir = join(root, '.tmp', 'salamander-sf3')
const outputPath = join(root, 'public', 'soundfonts', 'zPiano.sf3')
const ffmpeg = process.env.FFMPEG_PATH ?? join(cacheDir, 'ffmpeg', 'bin', 'ffmpeg.exe')
const sourceBase = 'https://raw.githubusercontent.com/SanicBoom/salamander-grand-piano/master'
const sampleRate = 24000
const velocityLayers = [5, 12]
const rootKeys = Array.from({ length: 22 }, (_, index) => 21 + index * 4)
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteName(key) {
  return `${noteNames[key % 12]}${Math.floor(key / 12) - 1}`
}

async function download(url, destination) {
  try {
    await stat(destination)
    return
  } catch {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
    await writeFile(destination, Buffer.from(await response.arrayBuffer()))
  }
}

function keyRange(index) {
  const current = rootKeys[index]
  const previous = rootKeys[index - 1]
  const next = rootKeys[index + 1]
  return {
    min: previous === undefined ? 21 : Math.ceil((previous + current) / 2),
    max: next === undefined ? 108 : Math.floor((current + next) / 2),
  }
}

await mkdir(cacheDir, { recursive: true })
await mkdir(join(cacheDir, 'source'), { recursive: true })
await mkdir(join(cacheDir, 'ogg'), { recursive: true })

const bank = new BasicSoundBank('sf2')
bank.soundBankInfo.name = 'Salamander Grand Piano Lite'
bank.soundBankInfo.engineer = 'Alexander Holm, lit by m3n'
bank.soundBankInfo.comment = '22 root keys, 2 velocity layers, mono 24 kHz Ogg Vorbis. Source: Salamander Grand Piano v3.'
bank.soundBankInfo.creationDate = new Date().toISOString().slice(0, 10)
bank.soundBankInfo.software = 'm3n tools/build-salamander-sf3.mjs'

const instrument = new BasicInstrument()
instrument.name = 'Salamander Grand Piano Lite'
const preset = new BasicPreset(bank)
preset.name = 'Salamander Grand Piano Lite'
preset.program = 0
preset.bankMSB = 0
preset.bankLSB = 0

for (const [keyIndex, rootKey] of rootKeys.entries()) {
  for (const [layerIndex, velocity] of velocityLayers.entries()) {
    const name = `${noteName(rootKey)}v${velocity}`
    const sourcePath = join(cacheDir, 'source', `${name}.flac`)
    const oggPath = join(cacheDir, 'ogg', `${name}.ogg`)
    await download(`${sourceBase}/${name}.flac`, sourcePath)
    try {
      await stat(oggPath)
    } catch {
      execFileSync(ffmpeg, ['-y', '-i', sourcePath, '-ac', '1', '-ar', String(sampleRate), '-c:a', 'libvorbis', '-q:a', '3', oggPath], { stdio: 'inherit' })
    }

    const sample = new BasicSample(name, sampleRate, rootKey, 0, SampleTypes.monoSample, 0, 0)
    sample.setCompressedData(await readFile(oggPath))
    bank.addSamples(sample)
    const zone = instrument.createZone(sample)
    zone.keyRange = keyRange(keyIndex)
    zone.velRange = layerIndex === 0 ? { min: 0, max: 79 } : { min: 80, max: 127 }
  }
}

bank.addInstruments(instrument)
preset.createZone(instrument)
bank.addPresets(preset)
bank.flush()
await writeFile(outputPath, Buffer.from(bank.writeSF2()))
console.log(`Wrote ${outputPath}`)
await rm(join(cacheDir, 'source'), { recursive: true, force: true })
await rm(join(cacheDir, 'ogg'), { recursive: true, force: true })
