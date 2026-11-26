// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NativeNumberedNotationScore } from './native-score.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeLyricInk, nativeLyricPieces, nativeLyricSvg } from './native-lyrics.js'
import { nativeSvgPieces } from './native-ink.js'
import { connectsLyricWord, lyricHyphenMetrics } from './lyric-spacing.js'

const options = { width: 640, paged: false }
const root = (source: string) => new DOMParser().parseFromString(NativeNumberedNotationScore.create(parseM3NDocument(source)).render(options).join(''), 'text/html')
it('connects only adjacent source syllables of a word', () => {
  const first = { wordpos: 'i' as const, sourceStart: 10, sourceEnd: 14 }
  expect(connectsLyricWord(first, { wordpos: 't', sourceStart: 15, sourceEnd: 16 })).toBe(true)
  expect(connectsLyricWord(first, { wordpos: 't', sourceStart: 20, sourceEnd: 21 })).toBe(false)
  expect(connectsLyricWord(first, { sourceStart: 15, sourceEnd: 16 })).toBe(false)
})
it('centres a separate hyphen between syllables across a measure, preserving text', () => {
  const page = root('{2/4}\nN: 1 2 | 3 4 |||\nL: Blue twin-kle sky')
  expect(page.querySelectorAll('.lyric-hyphen')).toHaveLength(1)
  const texts = [...page.querySelectorAll('[data-m3n-role="lyric"]')].filter(n => n.tagName === 'text')
  expect(texts.map(n => n.textContent)).toEqual(['Blue', 'twin', 'kle', 'sky'])
  const hyphen = page.querySelector('.lyric-hyphen line')!
  expect(Number(hyphen.getAttribute('x2')) - Number(hyphen.getAttribute('x1'))).toBeCloseTo(lyricHyphenMetrics(16).width)
})
it('retains a trailing hyphen at a forced row boundary without adding one to the next syllable', () => {
  const page = root('{2/4}\nN: 1 2 | {br}3 4 |||\nL: Blue twin-kle sky')
  const systems = page.querySelectorAll('g.system')
  expect(systems).toHaveLength(2)
  expect(systems[0]!.querySelectorAll('.lyric-hyphen')).toHaveLength(1)
  expect(systems[1]!.querySelectorAll('.lyric-hyphen')).toHaveLength(0)
})
it('handles independent repeat verses and leaves Chinese lyrics unchanged', () => {
  const page = root('{2/4}\nN: ||: 1 2 | 3 4 :|||\nL1: Twin-kle blue sky\nL2: One bright morn-ing')
  expect(page.querySelectorAll('.lyric-hyphen')).toHaveLength(2)
  expect(root('{2/4}\nN: 1 2 | 3 4 |||\nL: 春夏秋冬').querySelectorAll('.lyric-hyphen')).toHaveLength(0)
})
it('uses the painted connector ink in numeric geometry and reserves narrow spacing', () => {
  const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: Blue twin-kle sky'), options)
  const glyph = score.projection.glyphs.find(g => g.lyrics.get(0)?.word?.wordpos === 'i')!
  const data = glyph.lyrics.get(0)!, baseline = glyph.lyricBaselines!.get(0)!
  const numeric = nativeLyricPieces(data, glyph.x, baseline, score.measurer, glyph.lyricHyphenEnds?.get(0))
  const painted = nativeSvgPieces(nativeLyricSvg(glyph, 0, baseline, 0, score.measurer), score.measurer)
  expect(numeric).toEqual(painted)
  const next = score.projection.glyphs.find(g => g.lyrics.get(0)?.word?.wordpos === 't')!
  const nextInk = nativeLyricPieces(next.lyrics.get(0)!, next.x, baseline, score.measurer)[0]!
  expect(numeric[1]!.left).toBeGreaterThan(numeric[0]!.right)
  expect(numeric[1]!.right).toBeLessThan(nextInk.left)
})

it('connects every internal syllable and reserves its dash even at a narrow line end', () => {
  const page = root('{2/4}\nN: 1 2 | 3 4 |||\nL: im-per-fect blue')
  expect(page.querySelectorAll('.lyric-hyphen')).toHaveLength(2)
  const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: im-per-fect blue'), options)
  const data = score.projection.glyphs[0]!.lyrics.get(0)!
  const plain = nativeLyricInk({ ...data, word: undefined }, score.measurer)
  expect(nativeLyricInk(data, score.measurer).right - plain.right).toBeGreaterThan(6)
})
