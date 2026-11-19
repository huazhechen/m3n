import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { scoreToMei } from './score-mei.js'

describe('staff key signatures at alternate endings', () => {
  it('prints the same modulation separately in each house', () => {
    const mei = scoreToMei(parseM3NDocument('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=G}5 6 |||'))
    expect(mei.match(/<keySig sig="1s"/g)).toHaveLength(2)
  })
  it('does not print a cancellation inherited only from a skipped house', () => {
    const mei = scoreToMei(parseM3NDocument('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=C}5 6 |||'))
    const second = mei.slice(mei.indexOf('<ending n="2"'))
    expect(second).not.toContain('<scoreDef')
  })
})
