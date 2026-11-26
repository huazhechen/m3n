import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { waitForEditor } from './editor-state'

const categories = JSON.parse(readFileSync('config/scorebook/library-categories.json', 'utf8')) as Array<{ files: string[] }>
const files = categories.flatMap(category => category.files)

export function nextScorePath(slug: string) {
  const file = files[files.indexOf(`${slug}.m3n`) + 1]
  if (!file) throw new Error(`No next score for ${slug}`)
  return `/scores/${file.replace(/\.m3n$/, '')}`
}

export async function navigateScore(page: Page, direction: 'previous' | 'next', changes = true) {
  await waitForEditor(page)
  await page.keyboard.press('Escape')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const original = page.url()
  await page.keyboard.press(direction === 'next' ? 'ArrowRight' : 'ArrowLeft')
  if (changes) await expect(page).not.toHaveURL(original)
  else await expect(page).toHaveURL(original)
  await waitForEditor(page)
}
