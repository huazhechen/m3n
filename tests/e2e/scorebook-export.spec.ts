import { test, expect } from '@playwright/test'
import { readdir, writeFile } from 'node:fs/promises'
import { captureBrowserPrint, printedScorePdf } from './print-capture'

test('exports the full built-in library with progress and a vector PDF, independent of search', async ({ page }, info) => {
  test.setTimeout(120_000)
  await captureBrowserPrint(page)
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
  await expect(dialog.getByRole('button', { name: '保存 PDF' })).toBeVisible({ timeout: 90_000 })
  const count = (await readdir('src/scores')).filter(file => file.endsWith('.m3n')).length
  await expect(progress).toHaveAttribute('value', String(count))
  await expect(progress).toHaveAttribute('max', String(count))
  await dialog.getByRole('button', { name: '保存 PDF' }).click()
  const printed = await printedScorePdf(page)
  await writeFile(info.outputPath('full-scorebook.pdf'), printed.pdf)
  await info.attach('full-scorebook.pdf', { body: printed.pdf, contentType: 'application/pdf' })
  const geometry = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const scores = [...doc.querySelectorAll<SVGSVGElement>('svg[data-score-slug]')]
    return { slugs: [...new Set(scores.map(svg => svg.dataset.scoreSlug))],
      contents: doc.querySelectorAll('.print-page')[1].textContent,
      widths: scores.map(svg => [svg.dataset.scoreSlug, Number(svg.getAttribute('viewBox')?.split(/\s+/)[2])]),
      links: [...doc.querySelectorAll('svg a')].map(link => link.getAttribute('href')) }
  }, printed.html)
  expect(geometry.slugs).toHaveLength(count)
  expect(geometry.slugs[0]).toBe('ban_yin_jie_kou_qin_ji_ben_gong_01')
  expect(geometry.contents).toContain('目录')
  expect(geometry.links).toContain('https://score.cheesefans.com/scores/xiao_xing_xing_01')
  expect(geometry.widths.find(([slug]) => slug === 'ban_yin_jie_kou_qin_ji_ben_gong_01')?.[1]).toBe(720)
  expect(printed.pdf.subarray(0, 4).toString()).toBe('%PDF')
  expect(printed.html).not.toContain('<image')
  expect(requests.some(url => /\/api\/|\.otf(?:$|\?)/.test(url))).toBe(false)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore)
  expect(errors).toEqual([])
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
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
