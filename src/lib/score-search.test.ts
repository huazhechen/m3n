import { describe, expect, it } from 'vitest'
import { matchesScoreSearch } from './score-search'

const score = {
  searchText: '旋律练习 莫扎特',
  isLocal: false,
  hasLyrics: true,
  hasBass: true,
  keySignature: 'G',
  timeSignature: '2/4',
}

describe('score library search', () => {
  it.each(['', '   ', '旋律', '莫扎特', '词', '歌词', '低', '低音', '内置', '2/4', 'G', 'g', '内置 词 低 2/4 G 莫扎特'])('matches metadata or combined criteria: %s', query => {
    expect(matchesScoreSearch(score, query)).toBe(true)
  })

  it.each(['本地', '3/4', 'Gb', 'Gm', 'G 本地', '不存在的标题'])('rejects unmatched criteria: %s', query => {
    expect(matchesScoreSearch(score, query)).toBe(false)
  })

  it('matches properties rather than incidental words in titles and credits', () => {
    const incidental = { ...score, searchText: '本地 词 低 2/4 G', isLocal: false, hasLyrics: false, hasBass: false, keySignature: 'Gb', timeSignature: '4/4' }
    for (const query of ['本地', '词', '低', 'G', '2/4']) expect(matchesScoreSearch(incidental, query)).toBe(false)
  })

  it('matches local works and normalizes text case and spaces', () => {
    expect(matchesScoreSearch({ ...score, isLocal: true }, ' 本地   G\n词 ')).toBe(true)
    expect(matchesScoreSearch({ ...score, searchText: 'Morning Song' }, 'MORNING song')).toBe(true)
    expect(matchesScoreSearch({ ...score, keySignature: 'F#m' }, 'f#M')).toBe(true)
  })
})
