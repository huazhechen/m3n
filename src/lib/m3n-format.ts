import { splitSupplementBlocks } from './notation/supplements'

const BARLINE = /(:\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)/g

function formatMusic(source: string) {
  const pieces = source.trim().replace(/\s+/g, ' ').split(BARLINE)
  const lines: string[] = []
  let line = ''
  let measures = 0

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]?.trim()
    if (!piece) continue
    line = `${line}${line ? ' ' : ''}${piece}`
    if (index % 2 === 1) {
      measures += 1
      if (measures === 4) {
        lines.push(line)
        line = ''
        measures = 0
      }
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

function formatMain(source: string) {
  const header = /^.*\{key=[^\n]+$/m.exec(source)
  if (!header || header.index === undefined) return formatMusic(source)
  const headerEnd = header.index + header[0].length
  const music = source.slice(headerEnd).trim()
  return `${source.slice(0, headerEnd).trimEnd()}\n${formatMusic(music)}`
}

/** Formats M3N source without changing its musical or lyric content. */
export function formatM3N(source: string) {
  const { main, bass, lyrics } = splitSupplementBlocks(source)
  const supplements = [
    ...lyrics.map((lyric) => {
      const text = lyric.mode === 'char' ? lyric.text.replace(/\s+/g, '') : lyric.text.replace(/\s+/g, ' ').trim()
      const name = lyric.mode === 'word' ? 'lyrics-word' : 'lyrics'
      return `{${name}${lyric.range ? `=${lyric.range}` : ''}}\n${text}\n{/}`
    }),
    bass ? `{bass}\n${formatMusic(bass)}\n{/}` : '',
  ].filter(Boolean)
  return `${formatMain(main)}${supplements.length > 0 ? `\n\n${supplements.join('\n\n')}` : ''}\n`
}
