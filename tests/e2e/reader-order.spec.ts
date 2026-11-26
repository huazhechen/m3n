import { navigateScore } from './score-navigation'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const categories = JSON.parse(readFileSync('config/scorebook/library-categories.json', 'utf8')) as Array<{ files: string[] }>

const slug = (file: string) => file.replace(/\.m3n$/, '')

test('reader navigation follows category order, including category boundaries', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:library-view', 'alphabetical'))
  const first = categories[0]!.files
  await page.goto(`/scores/${slug(first[0]!)}`)
  await navigateScore(page, 'previous', false)
  await navigateScore(page, 'next')
  await expect(page).toHaveURL(new RegExp(`/scores/${slug(first[1]!)}$`))
  await navigateScore(page, 'previous')
  await expect(page).toHaveURL(new RegExp(`/scores/${slug(first[0]!)}$`))
  await page.goto(`/scores/${slug(first.at(-1)!)}`)
  await navigateScore(page, 'next')
  await expect(page).toHaveURL(new RegExp(`/scores/${slug(categories[1]!.files[0]!)}$`))
  const last = categories.at(-1)!.files
  await page.goto(`/scores/${slug(last.at(-1)!)}`)
  await navigateScore(page, 'next', false)
})
