import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatM3N } from '../src/lib/m3n-format'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scores = path.join(root, 'src', 'scores')
const shouldWrite = process.argv.includes('--write')
const files = (await readdir(scores)).filter((file) => file.endsWith('.m3n')).sort()

for (const file of files) {
  const filePath = path.join(scores, file)
  const original = await readFile(filePath, 'utf8')
  const formatted = formatM3N(original)
  if (original !== formatted && shouldWrite) await writeFile(filePath, formatted, 'utf8')
}

console.log(`${shouldWrite ? 'Formatted' : 'Would format'} ${files.length} M3N files`)
