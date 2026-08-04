import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Migration = { source: string; changed: boolean; blockers: string[] }

function sections(source: string) {
  const result = new Map<string, string[]>()
  let current = ''
  for (const line of source.split(/\r?\n/)) {
    const match = /^===\s*(.*)$/.exec(line.trim())
    if (match) {
      current = match[1]?.trim() ?? ''
      if (!result.has(current)) result.set(current, [])
      continue
    }
    if (current) result.get(current)?.push(line)
  }
  return result
}

function normalizePhrases(source: string) {
  const output: string[] = []
  let previousWasMelody = false
  for (const line of source.split(/\r?\n/)) {
    const melody = /^\s*N:/.test(line)
    if (melody && previousWasMelody) output.push('---')
    output.push(melody && !/(?:\|\|:|:\|\|:|:\|\|\||:\|\||\|\|\||\|\||\|)(?:\{x\d+\})?\s*(?:\/\/.*)?$/.test(line) ? `${line.trimEnd()} |` : line)
    previousWasMelody = melody
  }
  return output.join('\n')
}

function occurrenceLyrics(lines: readonly string[], occurrence: number) {
  const numbered = new Map(lines.flatMap((line) => {
    const match = /^\s*L(\d+):\s*(.*)$/.exec(line)
    return match ? [[Number(match[1]), match[2] ?? ''] as const] : []
  }))
  return lines.flatMap((line) => {
    const match = /^\s*L(\d+):\s*(.*)$/.exec(line)
    if (!match) return [line]
    const selected = numbered.get(occurrence)
    if (selected === undefined) return []
    const reference = /^\{L(\d+)\}$/.exec(selected.trim())
    return [`L: ${reference ? numbered.get(Number(reference[1])) ?? selected : selected}`]
  })
}

export function migrateV04(source: string): Migration {
  const blockers: string[] = []
  if (/\{(?:segno|ds|dc|fine)\}/.test(source)) blockers.push('contains removed D.S./D.C. navigation')
  if (/\{(?:volta|ending)=[^}]*\}/.test(source)) blockers.push('contains removed inline ending syntax')
  const form = /\{form=([^}]*)\}/.exec(source)
  if (form) {
    const order = form[1]!.split(',').map((name) => name.trim()).filter(Boolean)
    const byName = sections(source)
    if (order.some((name) => !byName.has(name))) blockers.push('form references an undefined section')
    if (blockers.length > 0) return { source, changed: false, blockers }
    const prefix = source.split(/\r?\n/)
      .slice(0, source.split(/\r?\n/).findIndex((line) => /^===/.test(line)))
      .map((line) => line.replace(/\{form=[^}]*\}/g, '').trimEnd())
      .filter(Boolean)
      .join('\n')
    const visits = new Map<string, number>()
    const body = order.flatMap((name) => {
      const occurrence = (visits.get(name) ?? 0) + 1
      visits.set(name, occurrence)
      return [`===${name}`, ...occurrenceLyrics(byName.get(name) ?? [], occurrence)]
    }).join('\n')
    source = [prefix, body].filter(Boolean).join('\n')
  }
  if (blockers.length > 0) return { source, changed: false, blockers }
  return { source: `${normalizePhrases(source).trim()}\n`, changed: true, blockers }
}

async function main() {
  const write = process.argv.includes('--write')
  const directory = resolve(process.cwd(), 'src/scores')
  const files = (await readdir(directory)).filter((file) => file.endsWith('.m3n')).sort()
  const blocked: string[] = []
  let changed = 0
  for (const file of files) {
    const path = resolve(directory, file)
    const result = migrateV04(await readFile(path, 'utf8'))
    if (result.blockers.length > 0) {
      blocked.push(`${file}: ${result.blockers.join('; ')}`)
      continue
    }
    if (write && result.changed) await writeFile(path, result.source)
    if (result.changed) changed += 1
  }
  console.log(`${write ? 'migrated' : 'would migrate'} ${changed} score files`)
  for (const message of blocked) console.log(`BLOCKED ${message}`)
  if (blocked.length > 0) process.exitCode = 2
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) void main()
