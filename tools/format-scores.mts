import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { formatM3N } from '../src/lib/m3n-format'

const scoresDirectory = resolve('src/scores')
const files = (await readdir(scoresDirectory)).filter((file) => file.endsWith('.m3n')).sort()

for (const file of files) {
  const path = resolve(scoresDirectory, file)
  const source = await readFile(path, 'utf8')
  const formatted = formatM3N(source)
  if (formatted !== source) await writeFile(path, formatted, 'utf8')
}

console.log(`Formatted ${files.length} score files.`)
