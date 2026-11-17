import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseM3NDocument } from '@m3n/notation'
import { withPreferredWidth } from './scorebook-source.mjs'

test('writeback preserves comments, line endings and musical source, and is idempotent', () => {
  const source = '// {preferred-width=800}\r\n{title=测试}\r\nN: 1 2 3 4 |||\r\n'
  const updated = withPreferredWidth(source, 680)
  assert.equal(updated, '{preferred-width=680}\r\n' + source)
  assert.equal(withPreferredWidth(updated, 680), updated)
  assert.equal(withPreferredWidth(updated, 740), updated.replace('{preferred-width=680}', '{preferred-width=740}'))
  assert.equal(parseM3NDocument(updated).preferredWidth, 680)
  assert.throws(() => withPreferredWidth(source, 319), /Invalid/)
})

test('a concurrent edit prevents writeback of every source', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createHash } = await import('node:crypto')
  const { writePreferredWidths } = await import('./scorebook-source.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'm3n-widths-'))
  const original = 'N: 1 2 3 4 |||\n'
  const records = ['a.m3n', 'b.m3n'].map(file => ({ file, width: 680, sourceSha256: createHash('sha256').update(original).digest('hex') }))
  try {
    writeFileSync(join(directory, 'a.m3n'), original)
    writeFileSync(join(directory, 'b.m3n'), original + '// edited\n')
    assert.throws(() => writePreferredWidths(records, directory), /Source changed during build/)
    assert.equal(readFileSync(join(directory, 'a.m3n'), 'utf8'), original)
    assert.equal(readFileSync(join(directory, 'b.m3n'), 'utf8'), original + '// edited\n')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
