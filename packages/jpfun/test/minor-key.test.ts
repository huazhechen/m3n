import { deepEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { commandsOfKind, expectCompileError } from './helpers.js'

test('minor key labels use 6 and retain accidental drawing', () => {
  for (const [basis, tonic] of [['C4', 'A'], ['F4', 'D'], ['G4', 'E'], ['Db4', 'B']] as const) {
    const texts = commandsOfKind(`@key(${basis},degree=6)`, 'text').map(command => command.text)
    deepEqual(texts, ['6=', tonic])
  }
  deepEqual(commandsOfKind('@key(C4)', 'text').map(command => command.text), ['1=', 'C'])
  expectCompileError('@key(C4,degree=2)', 'E_KEY_DEGREE')
})
