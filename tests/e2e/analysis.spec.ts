import { expect, test } from '@playwright/test'

test('analyzes edits in a worker and waits for composition to finish', async ({ page }) => {
  await page.goto('/editor')
  const input = page.getByLabel('M3N source')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg').first()).toBeVisible()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.playback-loading-dialog[open]')).toHaveCount(0)
  const source = '{title=后台分析}{4/4}\nN: 1 2 3 4 |||'
  await input.fill(source)
  await expect.poll(() => page.workers().length).toBe(1)
  expect(page.workers()[0]!.url()).toMatch(/^blob:/)
  await expect(paper).toContainText('后台分析')
  await expect(paper.locator('svg').first()).toHaveAttribute('width', '720')
  await paper.locator('svg').first().evaluate(svg => svg.setAttribute('data-composition-preserved', 'true'))

  await input.dispatchEvent('compositionstart')
  await input.evaluate(editor => {
    // Dispatch a document edit through CodeMirror while the IME is active.
    const view = Reflect.get(editor, 'cmTile').root.view as {
      dispatch: (transaction: { changes: { from: number; to: number; insert: string } }) => void
    }
    view.dispatch({ changes: { from: 7, to: 11, insert: '完成输入' } })
  })
  await expect(page.getByRole('status', { name: '乐谱分析状态' })).toHaveText('正在输入…')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled()
  // This negative assertion must outlast the 80 ms edit debounce.
  await page.waitForTimeout(160)
  await expect(paper).toContainText('后台分析')
  await expect(paper).not.toContainText('完成输入')
  await expect(paper.locator('svg[data-composition-preserved]')).toHaveCount(1)
  await input.dispatchEvent('compositionend')
  await expect(input).toContainText('{title=完成输入}')
  await expect(paper).toContainText('完成输入')
  await expect(page.getByRole('status', { name: '乐谱分析状态' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  expect(page.workers()).toHaveLength(1)
})
