import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { test } from 'node:test'
import { scoreCjkFont } from '../packages/numbered-notation/dist/fonts.js'

test('book cover and contents select a small web and PDF font instead of full CJK', () => {
  const plan = JSON.parse(readFileSync(new URL('../config/scorebook/editorial-plan.json', import.meta.url)))
  const text = plan.title + plan.sections.map(section => section.title).join('')
    + plan.entries.map(entry => entry.title).join('') + '目录演唱作词作曲音域：→'
  const font = scoreCjkFont(text)
  assert.match(font.file, /^NotoSansSC-scorebook-front-[a-f0-9]+\.ttf$/)
  assert.ok(font.webUrl, 'browser uses WOFF2 rather than fetching the TTF')
  assert.ok(statSync(new URL(font.webUrl)).size < 100_000)
  assert.ok(statSync(new URL(font.url)).size < 200_000)
  for (const char of text + '0123456789–https://score.cheesefans.com/') {
    assert.ok(font.characters.includes(char), `Front font is missing ${char}`)
  }
})
