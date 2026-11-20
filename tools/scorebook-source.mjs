import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { parseM3NSyntaxTree } from '@m3n/notation'

/** Update only the header directive, preserving comments, lyrics and music. */
export function withPreferredWidth(source, width, field = 'preferred-width') {
  if (!['preferred-width', 'staff-preferred-width'].includes(field)) throw new Error('Invalid width field')
  if (!Number.isInteger(width) || width < 320 || width > 2560) throw new Error('Invalid preferred width')
  const tree = parseM3NSyntaxTree(source)
  const headers = new Set(tree.lines.filter(line => line.kind === 'header').map(line => line.line))
  const fields = tree.directives.filter(directive => directive.name === field && headers.has(directive.line))
  if (fields.length > 1) throw new Error(`Duplicate ${field} header`)
  const value = `{${field}=${width}}`
  if (fields.length) return source.slice(0, fields[0].start) + value + source.slice(fields[0].end)
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return value + newline + source
}

/** Verify all inputs before changing any source. Call only after layout validation. */
export function writePreferredWidths(records, sourceDirectory, field = 'preferred-width') {
  const hash = source => createHash('sha256').update(source).digest('hex')
  const updates = records.map(entry => {
    const path = join(sourceDirectory, entry.file), original = readFileSync(path, 'utf8')
    assert.equal(hash(original), entry.sourceSha256, `Source changed during build: ${entry.file}`)
    return { entry, path, original, updated: withPreferredWidth(original, entry.width, field) }
  })
  for (const { entry, path, original, updated } of updates) {
    if (original !== updated) { writeFileSync(`${path}.tmp`, updated); renameSync(`${path}.tmp`, path) }
    entry.renderedSourceSha256 = entry.sourceSha256
    entry.sourceSha256 = hash(updated)
  }
}
