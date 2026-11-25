import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { scoreCjkFont } from '../packages/numbered-notation/dist/fonts.js'

const scoreText = readFileSync(new URL('../src/scores/yue_ding_01.m3n', import.meta.url), 'utf8')
const scoreFont = scoreCjkFont(scoreText)
assert.notEqual(scoreFont.file, 'NotoSansSC-full.ttf', 'The routine PDF test must use an actual score subset')
test('editor text outside score subsets selects the full font without loading its bytes', () => {
  assert.equal(scoreCjkFont('龘').file, 'NotoSansSC-full.ttf')
})

const files = [scoreFont.file]
if (process.argv.includes('--full-font')) files.push('NotoSansSC-full.ttf')
for (const file of files) {
  test(`PDF TrueType subsetting preserves every outline (${file})`, async () => {
    const bytes = readFileSync(new URL(`../packages/numbered-notation/src/font-assets/${file}`, import.meta.url))
    const codes = fontkit.create(bytes).characterSet
    // Audit every glyph without retaining the complete font's decoded outlines.
    // A new source font per batch also releases fontkit's glyph caches.
    const batchSize = 256
    for (let offset = 0; offset < codes.length; offset += batchSize) {
      globalThis.gc?.()
      const font = fontkit.create(bytes), subset = font.createSubset()
      const glyphs = codes.slice(offset, offset + batchSize).map(code => font.glyphForCodePoint(code))
      const ids = glyphs.map(glyph => subset.includeGlyph(glyph))
      const chunks = []
      await new Promise((resolve, reject) => subset.encodeStream().on('data', chunk => chunks.push(chunk)).on('end', resolve).on('error', reject))
      const embedded = fontkit.create(Buffer.concat(chunks))
      for (const [index, glyph] of glyphs.entries()) {
        assert.deepEqual(embedded.getGlyph(ids[index]).path.commands, glyph.path.commands, `Glyph ${glyph.id}`)
      }
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
