import { describe, expect, it } from 'vitest'
import { isSharedScoreId, submittedScoreId } from './shared-scores'

describe('submittedScoreId', () => {
  it('uses the score title pinyin and timestamp', () => {
    const id = submittedScoreId('{title=小星星}\n{key=C}', 1785859200000)

    expect(id).toBe('xiao_xing_xing_1785859200000')
    expect(isSharedScoreId(id)).toBe(true)
  })

  it('uses an untitled fallback for scores without a title', () => {
    expect(submittedScoreId('{key=C}', 1785859200000)).toBe('untitled_1785859200000')
  })
})
