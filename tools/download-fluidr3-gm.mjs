import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputPath = resolve(root, 'public/soundfonts/FluidR3_GM.sf2')
const temporaryPath = `${outputPath}.download`
const sourceUrl = 'https://raw.githubusercontent.com/FluidSynth/fluidsynth/main/sf2/FluidR3_GM.sf2'

try {
  const existing = await stat(outputPath)
  if (existing.size > 0) {
    console.log(`Using existing ${outputPath}`)
    process.exit(0)
  }
} catch {
  // Download the source file when it is absent.
}

await mkdir(dirname(outputPath), { recursive: true })
await rm(temporaryPath, { force: true })

const response = await fetch(sourceUrl)
if (!response.ok || !response.body) {
  throw new Error(`Download failed (${response.status}): ${sourceUrl}`)
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath))
await rename(temporaryPath, outputPath)
console.log(`Downloaded ${outputPath}`)
