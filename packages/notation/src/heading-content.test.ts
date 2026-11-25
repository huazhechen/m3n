import { expect, it } from 'vitest'
import { numberedHeaderContent } from './heading-content.js'
import { parseM3NDocument } from './m3n-direct.js'

it.each([
  ['{lyricist=梁文福}{composer=梁文福}', ['梁文福 词曲']],
  ['{lyricist=甲}{composer=乙}', ['甲 作词', '乙 作曲']],
  ['{lyricist=甲}', ['甲 作词']],
  ['{composer=乙}', ['乙 作曲']],
  ['', []],
])('formats author credits for %s', (metadata, credits) => {
  const document = parseM3NDocument(`${metadata}{singer=陈洁仪}{origin=来源}\nN: 1 2 3 4 |||`)
  const before = structuredClone(document)
  expect(numberedHeaderContent(document)).toEqual({
    subtitles: ['陈洁仪 演唱'],
    credits: [...credits, '来源'],
  })
  expect(document).toEqual(before)
})
