import { describe, expect, it } from 'vitest'
import { sortScoresByTitle, sortScoresByModifiedTime, sortScoresByCategory, scoreTitleInitial } from './score-order'

describe('score title ordering', () => {
  it('groups titles by the same normalized pinyin used for sorting', () => {
    expect(['《小星星》', '爱尔兰画眉', 'Hello 2', 'Été', '123', ''].map(scoreTitleInitial))
      .toEqual(['X', 'A', 'H', 'E', '#', '#'])
  })

  it('interleaves Chinese pinyin and English titles alphabetically', () => {
    const scores = ['小星星', 'Zulu', '欢乐颂', '春天', 'apple', '爱尔兰画眉'].map(title => ({ title }))
    expect(sortScoresByTitle(scores).map(score => score.title)).toEqual([
      '爱尔兰画眉', 'apple', '春天', '欢乐颂', '小星星', 'Zulu',
    ])
    expect(scores[0]!.title).toBe('小星星')
  })

  it('orders equal initials by the remaining title, ignoring case and title punctuation', () => {
    const scores = ['《小星星》', '欢乐颂', 'hello 10', 'Hello 2', '花海'].map(title => ({ title }))
    expect(sortScoresByTitle(scores).map(score => score.title)).toEqual([
      'Hello 2', 'hello 10', '花海', '欢乐颂', '《小星星》',
    ])
  })
})

it('sorts local and preset scores together from newest to oldest without mutating input', () => {
  const scores = [
    { title: 'old local', modifiedAt: 10 },
    { title: 'new preset', modifiedAt: 30 },
    { title: 'same time', modifiedAt: 30 },
    { title: 'older preset', modifiedAt: 0 },
  ]
  expect(sortScoresByModifiedTime(scores).map(score => score.title)).toEqual(['new preset', 'same time', 'old local', 'older preset'])
  expect(scores[0]!.title).toBe('old local')
})


it('navigates in category and within-category order, then uncategorized title order', () => {
  const scores = [
    { title: 'A second chapter', category: { order: 1, itemOrder: 0 } },
    { title: 'Uncategorized Z' },
    { title: 'A second song', category: { order: 0, itemOrder: 1 } },
    { title: 'Z first song', category: { order: 0, itemOrder: 0 } },
    { title: 'Uncategorized A' },
  ]
  expect(sortScoresByCategory(scores).map(score => score.title)).toEqual([
    'Z first song', 'A second song', 'A second chapter', 'Uncategorized A', 'Uncategorized Z',
  ])
  expect(scores[0]!.title).toBe('A second chapter')
})
