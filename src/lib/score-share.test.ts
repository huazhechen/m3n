import { describe, expect, it } from 'vitest'
import { decodeScoreSource, encodeScoreSource, sharedScoreSource, sharedScoreUrl } from './score-share'

describe('shared score URLs', () => {
  it('round-trips UTF-8 score content as URL-safe Base64', () => {
    const source = '{title=老男孩}\n{4/4} 1 2 3 4 |||\n{lyrics}我曾经{/}'
    const encoded = encodeScoreSource(source)

    expect(encoded).not.toMatch(/[+/=]/)
    expect(decodeScoreSource(encoded)).toBe(source)
    expect(sharedScoreSource(new URL(sharedScoreUrl('/reader', source), 'https://m3n.local').search)).toBe(source)
  })

  it('rejects malformed shared score content', () => {
    expect(decodeScoreSource('not_base64!')).toBeNull()
  })
})
