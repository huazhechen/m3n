import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { formatM3N, m3nToMei, normalizeAdjacentBarlines, validateM3NDiagnostics } from '@m3n/notation'

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
  }))
  return nested.flat()
}

function diagnosticSet(source: string) {
  return new Set(validateM3NDiagnostics(source).map(({ code, message }) => `${code}: ${message.replace(/第 \d+ 行：/g, '')}`))
}

function assertEquivalent(label: string, before: string, after: string) {
  if (m3nToMei(normalizeAdjacentBarlines(before)).mei !== m3nToMei(after).mei) {
    throw new Error(`${label}: formatting changed engraved events or score structure`)
  }
  if (formatM3N(after) !== after) throw new Error(`${label}: formatting is not stable`)
  const beforeDiagnostics = diagnosticSet(before)
  const afterDiagnostics = diagnosticSet(after)
  const added = [...afterDiagnostics].filter((message) => !beforeDiagnostics.has(message))
  if (added.length > 0) throw new Error(`${label}: format introduced diagnostics: ${added.join(' | ')}`)
}

async function main() {
  const root = resolve(import.meta.dirname, '..')
  const scoreFiles = (await readdir(resolve(root, 'src/scores'))).filter((name) => name.endsWith('.m3n')).map((name) => resolve(root, 'src/scores', name))
  const documents = await markdownFiles(resolve(root, 'docs'))
  const updates: Array<{ path: string; value: string }> = []

  for (const path of scoreFiles) {
    const source = await readFile(path, 'utf8')
    const formatted = formatM3N(source)
    assertEquivalent(path, source, formatted)
    if (formatted !== source) updates.push({ path, value: formatted })
  }

  for (const path of documents) {
    const document = await readFile(path, 'utf8')
    const formatted = document.replace(/(<!-- m3n-format: preserve[^\n]*-->\r?\n)?```m3n\r?\n([\s\S]*?)```/g, (block, preserve: string | undefined, source: string, offset: number) => {
      if (preserve) return block
      const next = formatM3N(source)
      assertEquivalent(`${path}:${offset}`, source, next)
      return `\`\`\`m3n\n${next}\`\`\``
    })
    if (formatted !== document) updates.push({ path, value: formatted })
  }

  for (const update of updates) await writeFile(update.path, update.value, 'utf8')
  console.log(`Formatted ${updates.length} files (${scoreFiles.length} scores, ${documents.length} documents scanned).`)
}

void main()
