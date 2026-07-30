export type LyricBlock = {
  range: string
  text: string
}

export type SupplementBlocks = {
  main: string
  bass: string
  lyrics: LyricBlock[]
}

export function splitSupplementBlocks(source: string): SupplementBlocks {
  const lyrics: LyricBlock[] = []
  let bass = ''
  let main = source

  main = main.replace(/\{lyrics(?:=([^}]+))?\}([\s\S]*?)\{\/\}/g, (_match, range, text) => {
    lyrics.push({ range: range ?? '', text: String(text).trim() })
    return ''
  })

  main = main.replace(/\{bass\}([\s\S]*?)\{\/\}/g, (_match, text) => {
    bass = String(text).trim()
    return ''
  })

  return { main, bass, lyrics }
}
