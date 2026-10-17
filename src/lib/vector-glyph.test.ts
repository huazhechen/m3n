/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { parse } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { glyphPathData } from './vector-glyph'

const bytes = readFileSync(new URL('../../public/fonts/NotoSerifCJKsc-Regular.otf', import.meta.url))
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

describe('vector glyph coordinates', () => {
  it('keeps Chinese continuation titles complete at fractional baselines', () => {
    const baseline = Math.fround(38.02)
    expect(font.getPath('之', 43.224, baseline, 20).toPathData(3)).toContain('NaN')
    for (const char of '花之舞（续）') {
      const data = glyphPathData(font, char, 43.224, baseline, 20)
      expect(data).not.toMatch(/NaN|Infinity/)
      expect((data.match(/[MLCQZ]/g) ?? []).length).toBe(font.getPath(char, 43.224, baseline, 20).commands.length)
    }
  })
})
