import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const categories = JSON.parse(readFileSync('config/scorebook/library-categories.json', 'utf8')) as Array<{ files: string[] }>

const slug = (file: string) => file.replace(/\.m3n$/, '')

test('reader navigation follows category order, including category boundaries', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:library-view', 'alphabetical'))
  const first = categories[0]!.files
  await page.goto(`/scores/${slug(first[0]!)}`)
  await expect(page.getByRole('link', { name: '上一曲', exact: true })).toHaveAttribute('aria-disabled', 'true')
  const next = page.getByRole('link', { name: '下一曲', exact: true })
  await expect(next).toHaveAttribute('href', `/scores/${slug(first[1]!)}`)
  await next.click()
  await expect(page).toHaveURL(new RegExp(`/scores/${slug(first[1]!)}$`))
  await expect(page.getByRole('link', { name: '上一曲', exact: true })).toHaveAttribute('href', `/scores/${slug(first[0]!)}`)

  await page.goto(`/scores/${slug(first.at(-1)!)}`)
  await expect(page.getByRole('link', { name: '下一曲', exact: true })).toHaveAttribute('href', `/scores/${slug(categories[1]!.files[0]!)}`)

  const last = categories.at(-1)!.files
  await page.goto(`/scores/${slug(last.at(-1)!)}`)
  await expect(page.getByRole('link', { name: '下一曲', exact: true })).toHaveAttribute('aria-disabled', 'true')
})
