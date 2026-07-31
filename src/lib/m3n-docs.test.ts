import { describe, expect, it } from 'vitest'
import guide from '../../docs/GUIDE.md?raw'
import manual from '../../docs/MANUAL.md?raw'
import { m3nToMei } from './m3n-mei'
import { validateM3N } from './m3n-validate'

function m3nExamples(markdown: string) {
  return [...markdown.matchAll(/```m3n\r?\n([\s\S]*?)```/g)].map((match) => match[1].trim())
}

describe('documented M3N examples', () => {
  for (const [name, markdown] of [
    ['MANUAL', manual],
    ['GUIDE', guide],
  ] as const) {
    it(`${name} code blocks conform to the validator`, () => {
      const failures = m3nExamples(markdown)
        .map((source, index) => ({
          index: index + 1,
          diagnostics: [...validateM3N(source), ...m3nToMei(source).diagnostics],
        }))
        .filter((result) => result.diagnostics.length > 0)
      expect(failures).toEqual([])
    })
  }
})
