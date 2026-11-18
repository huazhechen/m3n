import { describe, expect, it } from 'vitest'
import guide from '../../docs/GUIDE.md?raw'
import manual from '../../docs/MANUAL.md?raw'
import homeExample from '../examples/huan_le_song.m3n?raw'
import { analyzeM3N, compileScorePerformance } from '@m3n/notation'
import { documentSections } from './docs-navigation'

function m3nExamples(markdown: string) {
  return [...markdown.matchAll(/```m3n\r?\n([\s\S]*?)```/g)].map((match) => match[1].trim())
}

describe('documented M3N examples', () => {
  it('validates the example used by the home page', () => {
    expect(analyzeM3N(homeExample).diagnostics).toEqual([])
    expect(compileScorePerformance(analyzeM3N(homeExample).score).notes.length).toBeGreaterThan(0)
  })

  for (const [name, markdown] of [
    ['MANUAL', manual],
    ['GUIDE', guide],
  ] as const) {
    it(`${name} code blocks conform to the validator`, () => {
      const failures = m3nExamples(markdown)
        .map((source, index) => ({
          index: index + 1,
          diagnostics: analyzeM3N(source).diagnostics,
        }))
        .filter((result) => result.diagnostics.length > 0)
      expect(failures).toEqual([])
    })
  }
})

describe('documentation links', () => {
  it('resolves section links to headings in the application', () => {
    const documents = { GUIDE: guide, MANUAL: manual }
    for (const [name, markdown] of Object.entries(documents)) {
      for (const match of markdown.matchAll(/\]\((?:(HOME|GUIDE|MANUAL)\.md)?#([^)]*)\)/g)) {
        const target = match[1] ?? name
        const headings = documentSections(documents[target as keyof typeof documents])
          .flatMap(section => [section, ...section.children])
        expect(headings.map(heading => heading.id), `${name}: ${match[0]}`)
          .toContain(decodeURIComponent(match[2]))
      }
    }
  })
})
