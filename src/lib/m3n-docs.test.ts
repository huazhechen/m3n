import { describe, expect, it } from 'vitest'
import readme from '../../docs/README.md?raw'
import guide from '../../docs/GUIDE.md?raw'
import manual from '../../docs/MANUAL.md?raw'
import { m3nToMei, validateM3NDiagnostics } from '@m3n/notation'

function m3nExamples(markdown: string) {
  return [...markdown.matchAll(/```m3n\r?\n([\s\S]*?)```/g)].map((match) => match[1].trim())
}

describe('documented M3N examples', () => {
  for (const [name, markdown] of [
    ['README', readme],
    ['MANUAL', manual],
    ['GUIDE', guide],
  ] as const) {
    it(`${name} code blocks conform to the validator`, () => {
      const failures = m3nExamples(markdown)
        .map((source, index) => ({
          index: index + 1,
          diagnostics: [...validateM3NDiagnostics(source), ...m3nToMei(source).diagnostics],
        }))
        .filter((result) => result.diagnostics.length > 0)
      expect(failures).toEqual([])
    })
  }
})
