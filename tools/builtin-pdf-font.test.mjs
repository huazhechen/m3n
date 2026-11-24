import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'

const bytes = readFileSync(new URL('../packages/numbered-notation/src/font-assets/NotoSansSC-full.ttf', import.meta.url))
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

test('Bravura symbol codepoints, design metrics and PDF subsets match the bundled font', async () => {
  const characters = {...JSON.parse(readFileSync(new URL('../packages/numbered-notation/src/bravura-characters.json', import.meta.url))), ...JSON.parse(readFileSync(new URL('../packages/numbered-notation/src/bravura-symbols.json', import.meta.url)))}
  const font = fontkit.create(readFileSync(new URL('../packages/numbered-notation/src/font-assets/Bravura.ttf', import.meta.url)))
  const web = fontkit.create(readFileSync(new URL('../packages/numbered-notation/src/font-assets/Bravura.woff2', import.meta.url)))
  const subset = font.createSubset(), pairs = []
  for (const metrics of Object.values(characters)) {
    const glyph = font.glyphForCodePoint(metrics.character.codePointAt(0))
    assert.notEqual(glyph.id, 0, 'Use an existing SMuFL glyph')
    assert.deepEqual(glyph.path.commands, web.glyphForCodePoint(metrics.character.codePointAt(0)).path.commands)
    assert.equal(glyph.bbox.minX / font.unitsPerEm, metrics.left ?? 0)
    assert.equal((glyph.bbox.maxX - glyph.bbox.minX) / font.unitsPerEm, metrics.width)
    assert.equal(glyph.bbox.maxY / font.unitsPerEm, metrics.ascent)
    assert.equal(-glyph.bbox.minY / font.unitsPerEm + 0, metrics.descent + 0)
    pairs.push({ glyph, id: subset.includeGlyph(glyph) })
  }
  const chunks = []
  await new Promise((resolve, reject) => subset.encodeStream().on('data', chunk => chunks.push(chunk)).on('end', resolve).on('error', reject))
  const embedded = fontkit.create(Buffer.concat(chunks))
  for (const { glyph, id } of pairs) assert.deepEqual(embedded.getGlyph(id).path.commands, glyph.path.commands)
})
