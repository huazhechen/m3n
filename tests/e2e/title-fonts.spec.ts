import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { openScoreSettings, selectNotationMode } from './score-settings'

for (const mode of ['首调', '五线谱'] as const) test(`normal-width Chinese and Latin titles stay consistent in ${mode} and exports`, async ({ page }, info) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{title=月亮代表我的心 Moon River}{4/4}\nN: 1 2 3 4 |||\nL: 春天来了')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/scores\//)
  await selectNotationMode(page, mode)
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '乐谱宽度', exact: true }).fill('27')
  await page.keyboard.press('Escape')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg').first()).toHaveAttribute('width', '648')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const titles = paper.locator('[data-m3n-role="title"]')
  await expect(titles.first()).toBeVisible()
  const typography = await titles.evaluateAll(elements => elements.flatMap(element => {
    const texts = element.tagName.toLowerCase() === 'text' ? [element] : [...element.querySelectorAll('text')]
    return texts.map(text => {
      const style = getComputedStyle(text)
      return { family: style.fontFamily, weight: style.fontWeight, text: text.textContent, stretch: text.hasAttribute('textLength') }
    })
  }))
  expect(typography.map(item => item.text).join('')).toContain('Moon')
  for (const item of typography) {
    expect(item.family).toMatch(/^"?Noto Sans SC/)
    expect(item.weight).toBe('500')
    expect(item.stretch).toBe(false)
  }
  const widths = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = '500 32px "Noto Sans SC"'
    const title = ctx.measureText('Moon River').width
    ctx.font = '500 32px "Barlow Semi Condensed"'
    return { title, condensed: ctx.measureText('Moon River').width }
  })
  expect(widths.title).toBeGreaterThan(widths.condensed)
  await paper.screenshot({ path: info.outputPath('title.png') })
  for (const format of ['PNG', 'PDF']) {
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const dialog = page.locator('.export-dialog')
    await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: format, exact: true }).click()
    const download = await downloading
    const file = info.outputPath(`title.${format.toLowerCase()}`)
    await download.saveAs(file)
    if (format === 'PDF') {
      const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
      expect(text.replaceAll(/\s/g, '')).toContain('月亮代表我的心MoonRiver')
    } else expect((await readFile(file)).subarray(1, 4).toString()).toBe('PNG')
  }
})
