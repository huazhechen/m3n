import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

it('keeps every library score unique and consistent across sources, categories and the book', () => {
  const files = readdirSync(new URL('../scores/', import.meta.url)).filter(file => file.endsWith('.m3n')).sort()
  const planned = plan.entries.map(entry => entry.file)
  const categorized = categories.flatMap(category => category.files)
  expect(plan.sourceCount).toBe(files.length)
  expect([...planned].sort()).toEqual(files)
  expect([...categorized].sort()).toEqual(files)
  expect(new Set(plan.entries.map(entry => entry.id)).size).toBe(files.length)
  for (const category of categories) {
    expect(plan.entries.filter(entry => entry.section === category.id).map(entry => entry.file), category.id)
      .toEqual(category.files)
  }
  for (const entry of plan.entries) {
    const score = parseM3NDocument(readFileSync(new URL(`../scores/${entry.file}`, import.meta.url), 'utf8'))
    expect(entry.id, entry.file).toBe(entry.file.replace(/_01\.m3n$/, ''))
    expect(entry.title, entry.file).toBe(score.title)
  }
})
