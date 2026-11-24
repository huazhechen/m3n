import { readFileSync } from 'node:fs'
import { parseM3NDocument, type ScoreEvent } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'

const source = readFileSync(new URL('../../../src/scores/li_hua_you_kai_fang_01.m3n', import.meta.url), 'utf8')
const score = parseM3NDocument(source)
// Image-derived syllable slots, including rests and unprinted melisma/tie targets.
// Each row describes the printed note heads, not just the concatenated lyrics.
const lyrics = [
  '_ 忘 不',
  '了 故 _ 乡 年 年 | 了 故 _ 乡 梨 花',
  '梨 花 放 _ 染 白 | 又 开 放 _ 找 到',
  '了 山 _ 岗 我 的 | 了 我 的 梦 我 _',
  '小 _ 村 _ 庄 妈 妈 | 一 腔 衷 _ 肠 小 _',
  '坐 在 梨 树 下 纺 车 _ | 村 一切 都 依 然 树 下 _',
  '嗡 嗡 响 _ _ 我 爬 | 空 荡 荡 _ _ 开 满',
  '上 梨 树 枝 闻 那 梨 | 梨花 的 树 下 纺 车 不',
  '花 香 _ 摇 摇 _ | 再 嗡 _ 摇 摇 _',
  '洁 白 的 树 枝 _ 花 雨 | 洁 白 的 树 枝 _ 花 雨',
  '满 天 飞 扬 落 在 | 满 天 飞 扬 两 行',
  '妈 妈 _ 头 上 飘 在 纺 车 上 | 滚 滚 _ 泪 水 _ 流 在 树 下',
  '_ 给 我 _ | _ 给 我 _',
  '幸 福 的 故 乡 _ 永 _ | 血 肉 的 故 乡 _ 永 _',
  '生 _ 难 _ 忘 哦 _ | 生 _ 难 _ 忘 哦 _',
  '永 生 _ 永 世 我 不 能 _ | 永 生 _ 永 世 我 不 能 _',
  '忘 _ 重 返',
  '忘 摇 摇 _',
  '忘 _ 哦 _',
  '永 生 _ 永 世 我 不 能 _',
  '忘',
].map(bar => bar.split(' | ').map(row => row.split(' ')))

const measures = score.parts.get('score')!.melody.filter(bar => bar.events.length)
const positions = new Map<ScoreEvent, { bar: number; note: number }>()
for (const [bar, measure] of measures.entries()) {
  let note = 1
  for (const event of measure.events) {
    positions.set(event, { bar: bar + 1, note })
    note += event.kind === 'tuplet' ? event.pitches.length : 1
  }
}

it('prints every first- and second-verse syllable under the image note, including both house pickups', () => {
  const layout = layoutNativeScore(score, { width: 720, paged: false })
  for (const [bar, rows] of lyrics.entries()) for (const [row, expected] of rows.entries()) {
    const glyphs = layout.projection.glyphs.filter(glyph => glyph.event && !glyph.sustain && positions.get(glyph.event)?.bar === bar + 1)
    const actual = glyphs.map(glyph => glyph.lyrics.get(row)?.texts.join('').replace(/[，。]/g, '') || '_')
    expect(actual, `bar ${bar + 1}, verse ${row + 1}`).toEqual(expected)
  }
  expect(measures[0]!.left).not.toBe('rptstart')
  expect(measures[1]!.left).toBe('rptstart')
})

it('matches every image tie and slur endpoint without mistaking a tuplet bracket for a slur', () => {
  const layout = layoutNativeScore(score, { width: 720, paged: false })
  const endpoint = (glyph: typeof layout.projection.glyphs[number]) => {
    const position = positions.get(glyph.event!)!
    return `${position.bar}:${position.note + (glyph.event!.kind === 'tuplet' ? glyph.slot : 0)}`
  }
  const ranges = (kind: 'tie' | 'slur') => layout.relations.filter(relation => relation.kind === kind)
    .map(relation => `${endpoint(relation.first)}→${endpoint(relation.last)}`).sort()
  expect(ranges('tie')).toEqual(['7:3→7:4', '10:5→10:6', '12:2→12:3', '14:5→14:6', '16:2→16:3', '20:2→20:3'].sort())
  expect(ranges('slur')).toEqual([
    '2:2→2:3', '4:2→4:3', '5:1→5:2', '5:3→5:4', '6:7→6:8',
    '9:1→9:2', '9:5→9:6', '12:10→13:1', '13:3→13:4', '14:7→14:8',
    '15:3→15:4', '15:6→15:7', '16:8→16:9', '18:3→18:4', '19:3→19:4', '20:8→20:9',
  ].sort())
})
