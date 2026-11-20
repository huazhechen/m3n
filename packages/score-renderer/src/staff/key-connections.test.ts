import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'

describe('staff key signatures at alternate endings', () => {
  it('prints the same modulation separately in each house', () => {
    const document = projectStaffDocument(parseM3NDocument('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=G}5 6 |||'))
    expect(document.measures.filter(m => m.key === 'G' && m.previousKey === 'C')).toHaveLength(2)
  })
  it('does not print a cancellation inherited only from a skipped house', () => {
    const document = projectStaffDocument(parseM3NDocument('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=C}5 6 |||'))
    const second = document.measures.find(m => m.source.ending === '2')!
    expect(second.key).toBe('C')
    expect(second.previousKey).toBe('C')
  })
})
