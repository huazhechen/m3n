import { expect, test } from '@playwright/test'

test('analyzes edits in a worker and waits for composition to finish', async ({ page }) => {
  await page.goto('/editor')
  const input = page.getByLabel('M3N source')
  const paper = page.locator('.score-paper')
  const source = '{title=后台分析}{4/4}\nN: 1 2 3 4 |||'
  const workerCreated = page.waitForEvent('worker')
  await input.fill(source)
  const worker = await workerCreated
  expect(worker.url()).toContain('analysis.worker-')
  await expect(paper).toContainText('后台分析')
  await paper.locator('svg').first().evaluate(svg => svg.setAttribute('data-composition-preserved', 'true'))

  await input.dispatchEvent('compositionstart')
  const finalSource = source.replace('后台分析', '完成输入')
  await input.fill(finalSource)
  await expect(page.getByRole('status', { name: '乐谱分析状态' })).toHaveText('正在输入…')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled()
  // This negative assertion must outlast the 80 ms edit debounce.
  await page.waitForTimeout(160)
  await expect(paper).toContainText('后台分析')
  await expect(paper).not.toContainText('完成输入')
  await expect(paper.locator('svg[data-composition-preserved]')).toHaveCount(1)
  await input.dispatchEvent('compositionend')
  await expect(paper).toContainText('完成输入')
  await expect(page.getByRole('status', { name: '乐谱分析状态' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  expect(page.workers()).toHaveLength(1)
})
