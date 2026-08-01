import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { happi123ToM3N } from '../src/lib/happi123-m3n'
import { validateM3N } from '../src/lib/m3n-validate'
import { formatM3N } from '../src/lib/m3n-format'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(root, 'src', 'scores', 'happi123')
const targetDirectory = path.join(root, 'src', 'scores')

function titleOf(score: string) {
  return /^\{title=(.+)\}$/m.exec(score)?.[1]
}

function comparable(score: string) {
  return score
    .replace(/^\{source=Happi123\}\r?\n/m, '')
    .replace(/\{br\}/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

const targetFiles = (await readdir(targetDirectory)).filter((file) => file.endsWith('.m3n'))
const targets = await Promise.all(
  targetFiles.map(async (file) => {
    const content = await readFile(path.join(targetDirectory, file), 'utf8')
    return { slug: file.replace(/\.m3n$/, ''), content, title: titleOf(content) }
  }),
)
const targetsByTitle = new Map<string | undefined, typeof targets>()
for (const target of targets) {
  const titleTargets = targetsByTitle.get(target.title) ?? []
  titleTargets.push(target)
  targetsByTitle.set(target.title, titleTargets)
}

let matches = 0
let differences = 0
for (const file of (await readdir(sourceDirectory)).filter((entry) => entry.endsWith('.h123')).sort()) {
  const id = file.replace(/\.h123$/, '')
  const converted = formatM3N(happi123ToM3N(await readFile(path.join(sourceDirectory, file), 'utf8')).output)
  const title = titleOf(converted)
  const candidates = targetsByTitle.get(title)
  if (!candidates || candidates.length === 0) {
    console.log(`${id}\t(no current score)\t${title ?? '(untitled)'}`)
    differences += 1
    continue
  }
  const target = candidates.find((candidate) => comparable(converted) === comparable(candidate.content)) ?? candidates[0]
  const sourceDiagnostics = validateM3N(converted)
  const targetDiagnostics = validateM3N(target.content)
  if (comparable(converted) === comparable(target.content)) {
    console.log(`${id}\t${target.slug}\tmatch\tsource=${sourceDiagnostics.length}\tcurrent=${targetDiagnostics.length}`)
    matches += 1
  } else {
    const status = sourceDiagnostics.length > 0 && targetDiagnostics.length === 0 ? 'repair' : 'different'
    console.log(`${id}\t${target.slug}\t${status}\tsource=${sourceDiagnostics.length}\tcurrent=${targetDiagnostics.length}`)
    differences += 1
  }
}

console.log(`Matched: ${matches}; different or unmapped: ${differences}`)
