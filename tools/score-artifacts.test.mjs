import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assertFullyStaged } from './score-artifacts.mjs'

test('pre-commit refuses partial or untracked score input and accepts fully staged input', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'm3n-artifact-hook-'))
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
  try {
    git('init')
    writeFileSync(join(cwd, 'score.m3n'), 'N: 1 2 |')
    assert.throws(() => assertFullyStaged(['score.m3n'], cwd), /score.m3n/)
    git('add', 'score.m3n')
    assert.doesNotThrow(() => assertFullyStaged(['score.m3n'], cwd))
    writeFileSync(join(cwd, 'score.m3n'), 'N: 1 2 3 4 |')
    assert.throws(() => assertFullyStaged(['score.m3n'], cwd), /score.m3n/)
    git('add', 'score.m3n')
    assert.doesNotThrow(() => assertFullyStaged(['score.m3n'], cwd))
    writeFileSync(join(cwd, 'notes.txt'), 'unrelated work')
    assert.doesNotThrow(() => assertFullyStaged(['score.m3n'], cwd))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
