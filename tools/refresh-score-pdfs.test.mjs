import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('PDF refresh runs in project order from any cwd and stops on each failed step', () => {
  const root = mkdtempSync(join(tmpdir(), 'm3n-refresh-pdfs-'))
  try {
    mkdirSync(join(root, 'tools'))
    copyFileSync(new URL('./refresh-score-pdfs.mjs', import.meta.url), join(root, 'tools/refresh-score-pdfs.mjs'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'build:packages': 'node tools/packages.mjs' } }))
    for (const [filename, step] of [['packages', 'packages'], ['build-scorebook', 'book'], ['export-score-pdfs', 'solo']]) {
      writeFileSync(join(root, `tools/${filename}.mjs`), `import { appendFileSync } from 'node:fs';
appendFileSync('steps.log', ${JSON.stringify(step + '\n')});
if (process.env.M3N_TEST_FAIL_STEP === ${JSON.stringify(step)}) process.exit(7);
`)
    }
    const run = (args = [], failure = '') => spawnSync(process.execPath, [join(root, 'tools/refresh-score-pdfs.mjs'), ...args], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, M3N_TEST_FAIL_STEP: failure },
    })
    assert.equal(run(['--help']).status, 0)
    assert.equal(run(['--unknown']).status, 1)
    for (const [failure, expected] of [['', 'packages\nbook\nsolo\n'], ['packages', 'packages\n'], ['book', 'packages\nbook\n'], ['solo', 'packages\nbook\nsolo\n']]) {
      writeFileSync(join(root, 'steps.log'), '')
      const result = run([], failure)
      assert.equal(result.status, failure ? 7 : 0, result.stderr)
      assert.equal(readFileSync(join(root, 'steps.log'), 'utf8'), expected)
      if (failure) assert.match(result.stderr, /PDF refresh stopped/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
