import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { validateM3NDiagnostics } from '@m3n/notation'
import contracts from './fixtures/score-contracts.json'
import { scoreContract } from './fixtures/score-contract'

it.each(Object.entries(contracts))('%s has the approved notes, navigation, expression and timed lyrics', (file, contract) => {
  const source = readFileSync(new URL(`../scores/${file}`, import.meta.url), 'utf8')
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(scoreContract(source)).toEqual(contract)
})
