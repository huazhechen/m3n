import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatM3N } from '../src/lib/m3n-format'
import { m3nToMei } from '../src/lib/m3n-mei'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scores = path.join(root, 'src', 'scores')
const docs = path.join(root, 'docs')
const shouldWrite = process.argv.includes('--write')
const files = (await readdir(scores)).filter((file) => file.endsWith('.m3n')).sort()
const docFiles = (await readdir(docs)).filter((file) => file.endsWith('.md')).sort()

function formatChecked(source: string, label: string) {
  const formatted = formatM3N(source)
  if (m3nToMei(source).mei !== m3nToMei(formatted).mei) {
    throw new Error(`格式化改变了乐谱语义：${label}`)
  }
  return formatted
}

function formatM3NBlocks(source: string, label: string) {
  let block = 0
  return source.replace(/```m3n\r?\n([\s\S]*?)\r?\n```/g, (_match, content) => {
    block += 1
    return `\`\`\`m3n\n${formatChecked(content, `${label}#${block}`).trimEnd()}\n\`\`\``
  })
}

for (const file of files) {
  const filePath = path.join(scores, file)
  const original = await readFile(filePath, 'utf8')
  const formatted = formatChecked(original, file)
  if (original !== formatted && shouldWrite) await writeFile(filePath, formatted, 'utf8')
}

for (const file of docFiles) {
  const filePath = path.join(docs, file)
  const original = await readFile(filePath, 'utf8')
  const formatted = formatM3NBlocks(original, file)
  if (original !== formatted && shouldWrite) await writeFile(filePath, formatted, 'utf8')
}

console.log(`${shouldWrite ? 'Formatted' : 'Would format'} ${files.length} M3N files and ${docFiles.length} documentation files`)
