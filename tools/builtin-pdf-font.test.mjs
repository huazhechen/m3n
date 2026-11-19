import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'

const bytes = readFileSync(new URL('../src/assets/builtin-pdf-text.ttf', import.meta.url))
for (const text of ['周蕙 演唱 姚若龙 作词 陈小霞 作曲 约定 春天来了', undefined]) {
  test(`PDF TrueType subsetting preserves every outline (${text ? 'single score' : 'full corpus'})`, async () => {
    const font = fontkit.create(bytes)
    const subset = font.createSubset()
    const codes = text ? [...new Set([...text].map(char => char.codePointAt(0)))] : font.characterSet
    const glyphs = codes.map(code => font.glyphForCodePoint(code))
    const ids = glyphs.map(glyph => subset.includeGlyph(glyph))
    const chunks = []
    await new Promise((resolve, reject) => subset.encodeStream().on('data', chunk => chunks.push(chunk)).on('end', resolve).on('error', reject))
    const embedded = fontkit.create(Buffer.concat(chunks))
    for (const [index, glyph] of glyphs.entries()) {
      assert.deepEqual(embedded.getGlyph(ids[index]).path.commands, glyph.path.commands, `Glyph ${glyph.id}`)
    }
  })
}
