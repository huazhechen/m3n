import { test, expect } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { execFileSync } from 'node:child_process'

test('exports the full built-in library with progress and a vector PDF, independent of search', async ({ page }, info) => {
  test.setTimeout(5 * 60_000)
  await page.addInitScript(() => { window.print = () => { throw new Error('Printing unavailable') } })
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await page.goto('scores')
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('小星星')
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))
  await page.getByRole('button', { name: '导出全量谱集' }).click()
  const dialog = page.getByRole('dialog', { name: '导出全量谱集' })
  await expect(dialog).toBeVisible()
  const progress = dialog.getByRole('progressbar', { name: '谱集生成进度' })
  await expect(progress).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存 PDF' })).toBeVisible({ timeout: 4 * 60_000 })
  const count = (await readdir('src/scores')).filter(file => file.endsWith('.m3n')).length
  await expect(progress).toHaveAttribute('value', String(count))
  await expect(progress).toHaveAttribute('max', String(count))
  const description = await dialog.getByRole('status').first().innerText()
  const declaredPages = Number(description.match(/共 (\d+) 页/)![1])
  const started = Date.now()
  const downloading = page.waitForEvent('download', { timeout: 90_000 })
  await dialog.getByRole('button', { name: '保存 PDF' }).click()
  const download = await downloading
  console.log(`Full scorebook PDF generation and download: ${Date.now() - started}ms`)
  const path = info.outputPath('full-scorebook.pdf')
  await download.saveAs(path)
  const bytes = await readFile(path)
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(declaredPages)
  for (const sheet of pdf.getPages()) {
    expect(sheet.getWidth()).toBeCloseTo(210 * 72 / 25.4)
    expect(sheet.getHeight()).toBeCloseTo(297 * 72 / 25.4)
  }
  const links = execFileSync('pdfinfo', ['-url', path], { encoding: 'utf8' })
  for (const file of (await readdir('src/scores')).filter(file => file.endsWith('.m3n'))) {
    expect(links).toContain(`https://score.cheesefans.com/scores/${file.replace(/\.m3n$/, '')}`)
  }
  expect(links).toContain('https://score.cheesefans.com/')
  const fonts = execFileSync('pdffonts', [path], { encoding: 'utf8' }).trim().split('\n').slice(2)
  expect(fonts.filter(row => /yes\s+yes\s+yes/.test(row))).toHaveLength(1)
  expect(fonts.some(row => /Barlow.*yes\s+yes\s+yes/.test(row))).toBe(true)
  expect(fonts.some(row => /STSong-Light.*no\s+no\s+yes/.test(row))).toBe(true)
  expect(execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' }).trim().split('\n').slice(2)).toEqual([])
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s/g, '')
  expect(text).toContain('目录')
  expect(text).toContain('半音阶口琴基本功')
  expect(text).toContain('小星星')
  expect(text).toContain('约定')
  expect(requests.some(url => /\/api\/|\.(?:otf|ttf|woff2?)(?:$|\?)/.test(url))).toBe(false)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore)
  expect(errors).toEqual([])
  await page.getByRole('dialog', { name: '导出 PDF', exact: true }).getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('mobile export can be cancelled and started again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('scores')
  const open = page.getByRole('button', { name: '导出全量谱集' })
  const dialog = page.getByRole('dialog', { name: '导出全量谱集' })
  await open.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('progressbar')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(open).toBeFocused()
  await open.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
