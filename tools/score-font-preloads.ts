import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseM3NDocument } from '@m3n/notation'
// Use the built font-only module: the renderer entry includes browser-only glyph JSON.
import { scoreCjkFont, scoreFontText, type ScoreFontResource } from '../packages/numbered-notation/dist/fonts.js'
import { LATIN_FONTS, BRAVURA_FONTS } from '../packages/numbered-notation/dist/font-resources.js'

export type FontPreload = { url: string; as: 'font' | 'fetch' }

/** Match the renderer's font selection before the browser has fetched the source. */
export async function scoreFontPreloads(source: string, emit: (name: string, source: Buffer) => string, watch: (path: string) => void, production: boolean) {
  const cjk = scoreCjkFont(scoreFontText(parseM3NDocument(source)) + '演唱作词作曲音域：→演奏顺序：')
  const fonts: ScoreFontResource[] = [...LATIN_FONTS, BRAVURA_FONTS[0], cjk]
  return Promise.all(fonts.map(async font => {
    const path = fileURLToPath(font.webUrl ?? font.url)
    watch(path)
    const url = production ? emit(basename(path), await readFile(path)) : `/@fs${path}`
    return { url, as: font.webUrl ? 'font' : 'fetch' } satisfies FontPreload
  }))
}
