import { parseM3NSyntaxTree } from '../notation/syntax-tree.js'
import { parseM3NDocument } from '../m3n-direct.js'
import { parseLyricItems } from '../notation/lyrics.js'
import { projectM3NDocument } from '../notation/m3n-document.js'
import { phraseLyricTargets } from '../m3n-validate.js'
import { splitInlineComment, appendComment, mapLiteralSafe } from './text.js'

export function alignLyrics(source: string) {
  source = source.split('\n').map((line) => {
    const match = /^(L\d*:\s*)(.*)$/.exec(line)
    if (!match) return line
    const { content, comment } = splitInlineComment(match[2] ?? '')
    let lyric = mapLiteralSafe(content, (text) => text.replace(/\s*\|\s*/g, ' '), true)
    // Only actual placeholder tokens expand; grouped lyric text may contain literal braces.
    const placeholders = new Map(parseLyricItems(lyric, 0).filter((item) => item.kind === 'placeholder')
      .map((item) => [item.sourceStart, item]))
    for (const item of [...placeholders.values()].reverse()) {
      const count = /^\{%([1-9]\d*)\}$/.exec(lyric.slice(item.sourceStart, item.sourceEnd))?.[1]
      if (count) lyric = lyric.slice(0, item.sourceStart) + '%'.repeat(Number(count)) + lyric.slice(item.sourceEnd)
    }
    lyric = lyric.trimEnd()
    return appendComment(`${match[1]}${lyric}`, comment)
  }).join('\n')
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const { structure } = projection
  const document = parseM3NDocument(source, projection)
  const insertions: Array<{ start: number; end: number }> = []
  for (const section of structure.sections) for (const phrase of section.phrases) {
    const targetsByPass = phraseLyricTargets(document, structure, section.name, phrase)
    for (const lyric of phrase.lyrics) {
      if (/^\{L\d+\}$/.test(lyric.text.trim())) continue
      const pass = Number(lyric.label || 1)
      const measures = targetsByPass.get(pass) ?? targetsByPass.values().next().value
      if (!measures || measures.length < 2) continue
      const items = parseLyricItems(lyric.text, lyric.start)
      let itemIndex = 0
      for (const targets of measures.slice(0, -1)) {
        let targetIndex = 0
        while (itemIndex < items.length && targetIndex < targets.length) {
          const item = items[itemIndex]
          if (!item) break
          if (item.forceTiedTarget) {
            if (!targets[targetIndex]?.tied) break
          } else {
            while (targets[targetIndex]?.tied) targetIndex += 1
            if (targetIndex >= targets.length) break
          }
          itemIndex += 1
          targetIndex += 1
        }
        while (targets[targetIndex]?.tied) targetIndex += 1
        if (targetIndex < targets.length) break
        const previousItem = items[itemIndex - 1]
        const nextItem = items[itemIndex]
        const start = previousItem?.sourceEnd ?? nextItem?.sourceStart ?? lyric.start + lyric.text.length
        let end = start
        while (end < source.length && /[ \t]/.test(source[end] ?? '')) end += 1
        insertions.push({ start, end })
      }
    }
  }
  const grouped = new Map<number, { start: number; end: number; count: number }>()
  for (const insertion of insertions) {
    const existing = grouped.get(insertion.start)
    if (existing) existing.count += 1
    else grouped.set(insertion.start, { ...insertion, count: 1 })
  }
  const aligned = [...grouped.values()].sort((left, right) => right.start - left.start).reduce((result, item) => {
    const bars = Array.from({ length: item.count }, () => '|').join(' ')
    const leading = /\s/.test(result[item.start - 1] ?? '') ? '' : ' '
    const trailing = item.end >= result.length || /[\r\n]/.test(result[item.end] ?? '') ? '' : ' '
    return `${result.slice(0, item.start)}${leading}${bars}${trailing}${result.slice(item.end)}`
  }, source)
  return aligned.split('\n').map((line) => line.startsWith('L')
    ? mapLiteralSafe(line, (text) => text.replace(/%{2,}/g, (run) => `{%${run.length}}`), true)
    : line).join('\n')
}

