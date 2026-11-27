import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import fontkit from '@pdf-lib/fontkit'
import { fontDesignGlyphPath, fontDesignPathInk } from '../packages/numbered-notation/dist/font-design-path.js'
import { designTextStyle } from '../packages/numbered-notation/dist/font-design.js'

// Independent parsers must agree on every published glyph, including empty
// whitespace. This detects the historical fontkit short-loca outline loss.
const manifest = JSON.parse(readFileSync('tools/fonts/library/manifest.json', 'utf8'))
const files = manifest.fonts.map(font => resolve('tools/fonts/library', font.file))
const python = process.env.M3N_FONT_PYTHON ?? '.tmp/font-subset-env/bin/python'
const reference = JSON.parse(execFileSync(python, ['-c', `
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
class RawGlyph:
    def __init__(self, name, glyf):
        self.name,self.glyf=name,glyf
    def draw(self, pen):
        self.glyf[self.name].draw(pen,self.glyf)
result=[]
shear=float(sys.argv[1])
for path in sys.argv[2:]:
    font=TTFont(path)
    # Compare encoded contours. TTGlyphSet.draw additionally shifts top-level
    # outlines by hmtx LSB minus glyf xMin; fontkit.path exposes raw contours.
    glyphs={name:RawGlyph(name,font['glyf']) for name in font.getGlyphOrder()}
    values={}
    for code,name in font.getBestCmap().items():
        pen=BoundsPen(glyphs)
        glyphs[name].draw(pen)
        italic=BoundsPen(glyphs)
        glyphs[name].draw(TransformPen(italic,(1,0,shear,1,0,0)))
        values[code]={'bounds':pen.bounds,'italic':italic.bounds,'advance':font['hmtx'].metrics[name][0]}
    result.append(values)
print(json.dumps(result))
`, String(designTextStyle.italicShear), ...files], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
for (const [index, file] of files.entries()) {
  const bytes = readFileSync(file)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.fonts[index].sha256)
  const font = fontkit.create(bytes), expected = reference[index]
  // fontkit's characterSet includes cmap range holes and the U+FFFF end
  // marker. FontTools excludes .notdef mappings; verify each extra is .notdef.
  for (const code of font.characterSet) if (!expected[code]) assert.equal(font.glyphForCodePoint(code).id, 0)
  const codes = font.characterSet.filter(code => expected[code])
  assert.deepEqual([...codes].sort((a, b) => a - b), Object.keys(expected).map(Number).sort((a, b) => a - b))
  for (const [code, value] of Object.entries(expected)) {
    const glyph = font.glyphForCodePoint(Number(code))
    assert.equal(glyph.advanceWidth, value.advance, `${file} U+${Number(code).toString(16)} advance`)
    const path = fontDesignGlyphPath(glyph)
    if (!value.bounds) assert.equal(path.commands.length, 0, `${file} U+${Number(code).toString(16)} empty`)
    else {
      for (const [shear, reference] of [[0, value.bounds], [designTextStyle.italicShear, value.italic]]) {
        const bounds = fontDesignPathInk(path, shear)
        for (const [axis, actual] of [bounds.left, bounds.top, bounds.right, bounds.bottom].entries())
          assert(Math.abs(actual - reference[axis]) < 1e-7, `${file} U+${Number(code).toString(16)} bounds ${axis}: ${actual} vs ${reference[axis]}`)
      }
    }
  }
  console.log(`${manifest.fonts[index].file}: ${codes.length} codepoints, FontTools/design outline bounds and advances agree`)
}
