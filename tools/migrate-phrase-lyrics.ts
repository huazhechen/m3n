import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { parseM3NDocument, type DirectEvent } from '../src/lib/m3n-direct'
import { parseM3NDocumentStructure, type M3NPhrase } from '../src/lib/notation/m3n-document'
import { parseLyricItems } from '../src/lib/notation/lyrics'
import { measurePlaybackPasses } from '../src/lib/notation/repeats'
import { validateM3N } from '../src/lib/m3n-validate'

const scoreIds = process.argv.slice(2)

function phraseForEvent(phrases: M3NPhrase[], event: DirectEvent) {
  return phrases.find((phrase) => phrase.melody && phrase.melody.start <= event.sourceStart && event.sourceStart < phrase.melody.start + phrase.melody.text.length)
}

function instrumental(document: ReturnType<typeof parseM3NDocument>, event: DirectEvent) {
  return document.intervals.some((interval) => interval.kind === 'inst' && interval.staff === 'melody'
    && interval.start !== undefined && interval.end !== undefined && interval.start <= event.sourceStart && event.sourceEnd <= interval.end)
}

function migrate(file: string) {
  const source = readFileSync(file, 'utf8')
  const structure = parseM3NDocumentStructure(source)
  const phrases = structure.sections.flatMap((section) => section.phrases)
  const originalRows = phrases.flatMap((phrase) => phrase.lyrics.map((row) => ({ phrase, row })))
  if (originalRows.length === 0 || !originalRows.every(({ row }) => /^\d+$/.test(row.label))) return false
  const document = parseM3NDocument(source)
  const targets = new Map<number, Array<{ phrase: M3NPhrase; tied: boolean }>>()
  for (const part of document.parts.values()) {
    const passesByMeasure = measurePlaybackPasses(part.melody)
    let previousTied = false
    for (const measure of part.melody) {
      const passes = passesByMeasure.get(measure) ?? new Set([1])
      for (const event of measure.events) {
        const phrase = phraseForEvent(phrases, event)
        const tied = previousTied || event.tieFrom !== undefined
        previousTied = event.tie
        if (!phrase || event.kind === 'rest' || instrumental(document, event)) continue
        const count = event.kind === 'tuplet' ? event.pitches.filter((pitch) => pitch !== '0').length : 1
        for (const pass of passes) {
          const current = targets.get(pass) ?? []
          for (let index = 0; index < count; index += 1) current.push({ phrase, tied: tied && index === 0 })
          targets.set(pass, current)
        }
      }
    }
  }

  const assigned = new Map<M3NPhrase, Map<number, Array<{ start: number; end: number }>>>()
  for (const { row } of originalRows) {
    const pass = Number(row.label)
    const passTargets = targets.get(pass)
    if (!passTargets) return false
    const items = parseLyricItems(row.text, row.start, 'char')
    let targetIndex = 0
    for (const item of items) {
      if (item.forceTiedTarget) {
        if (!passTargets[targetIndex]?.tied) return false
      } else {
        while (passTargets[targetIndex]?.tied) targetIndex += 1
      }
      const target = passTargets[targetIndex++]
      if (!target) return false
      const byPass = assigned.get(target.phrase) ?? new Map<number, Array<{ start: number; end: number }>>()
      const chunk = byPass.get(pass) ?? []
      chunk.push({ start: item.sourceStart, end: item.sourceEnd })
      byPass.set(pass, chunk)
      assigned.set(target.phrase, byPass)
    }
    while (passTargets[targetIndex]?.tied) targetIndex += 1
    if (targetIndex !== passTargets.length) return false
  }

  const lyricLines = new Map<number, string[]>()
  for (const [phrase, byPass] of assigned) {
    const activePasses = [...byPass.keys()].sort((left, right) => left - right)
    const rows = activePasses.map((pass, index) => {
      const ranges = byPass.get(pass) ?? []
      const text = ranges.map(({ start, end }) => source.slice(start, end)).join('')
      return `${activePasses.length === 1 ? 'L' : `L${index + 1}`}: ${text}`
    })
    if (phrase.melody) lyricLines.set(phrase.melody.line, rows)
  }

  const lines = source.split(/\r?\n/)
  const output: string[] = []
  for (const [index, line] of lines.entries()) {
    if (/^\s*L\d*:\s*/.test(line)) continue
    output.push(line)
    output.push(...(lyricLines.get(index + 1) ?? []))
  }
  const migrated = output.join('\n')
  if (validateM3N(migrated).some((message) => message.startsWith('[L]'))) return false
  writeFileSync(file, migrated)
  return true
}

const files = scoreIds.length > 0
  ? scoreIds.map((id) => `src/scores/${id.padStart(5, '0')}.m3n`)
  : readdirSync('src/scores').filter((file) => /^\d+\.m3n$/.test(file)).map((file) => `src/scores/${file}`)
for (const file of files) console.log(`${migrate(file) ? 'migrated' : 'skipped'} ${file}`)
