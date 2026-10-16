import { expect, test } from '@playwright/test'

const source = '{title=本地测试}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('browse saves locally and edit reuses the score id', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存并预览' }).click()

  await expect(page).toHaveURL(/\/scores\/local-/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/editor\/local-/)
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  const editorUrl = page.url()
  const revised = source.replace('本地测试', '本地测试修订')
  await page.getByLabel('M3N source').fill(revised)
  await page.getByRole('button', { name: '保存并预览' }).click()
  await expect(page).toHaveURL(editorUrl.replace('/editor/', '/scores/'))
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('m3n:local-scores') ?? '[]'))
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ source: revised, expiresAt: null })
})

test('recovers the latest draft after reload and downloads an imported source file', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await expect(page.getByRole('status', { name: '草稿保存状态' })).toContainText('草稿已保存')
  await page.reload()
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  const imported = source.replace('本地测试', '文件导入')
  await page.getByLabel('导入 M3N 文件').setInputFiles({ name: 'test.m3n', mimeType: 'text/plain', buffer: Buffer.from(imported) })
  await expect(page.getByLabel('M3N source')).toHaveText(imported, { useInnerText: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 M3N' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.m3n$/)
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe(imported)
})

test('keeps the editor open with the source when local storage rejects a save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'm3n:local-scores') throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存并预览' }).click()
  await expect(page.getByRole('alert')).toContainText('本地保存失败')
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
})

test('does not substitute a default score for a missing local work', async ({ page }) => {
  await page.goto('/editor/local-missing')
  await expect(page.getByRole('alert')).toContainText('乐谱不存在或已过期')
  await expect(page.getByLabel('M3N source')).toHaveCount(0)
})

test('loads only the selected built-in score body', async ({ page }) => {
  const bodies: string[] = []
  page.on('request', request => {
    if (/\/assets\/[a-z_]+_01-[^/]+\.js$/.test(new URL(request.url()).pathname)) bodies.push(request.url())
  })
  await page.goto('/scores')
  await expect(page.getByRole('heading', { name: '乐谱库', exact: true })).toBeVisible()
  expect(bodies).toEqual([])
  await page.goto('/scores/xiao_xing_xing_01')
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toContain('xiao_xing_xing_01-')
})

test('submit is simulated locally and opens the reader', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.getByText('本地模拟提交')).toBeVisible()
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '临时分享' }).click()

  await expect(page).toHaveURL(/\/scores\/[a-z0-9_]+_[0-9]{13}/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })
})

test('score library marks local scores, opens on click, and deletes', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存并预览' }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  const localCard = page.locator('.score-list .score-card', { hasText: '本地测试' })
  await expect(localCard).toBeVisible()
  await expect(localCard.locator('.score-card-marker')).toHaveText('本地')
  await expect(page.locator('.score-card-marker')).toHaveCount(1)
  await localCard.click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  page.on('dialog', (dialog) => dialog.accept())
  const card = page.locator('.score-list .score-card', { hasText: '本地测试' })
  await card.getByRole('button', { name: '删除' }).click()
  await expect(card).toHaveCount(0)
})

test('library mixes local and built-in titles alphabetically and has no automatic ratings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:local-scores', JSON.stringify(['Zzz 排序用例', 'Aaa 排序用例'].map((title, index) => ({
      id: `local-sort-${index}`,
      source: `{title=${title}} {4/4}\nN: 1 2 3 4 |||`,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 86_400_000,
    }))))
  })
  await page.goto('/scores')
  const titles = page.locator('.score-list .score-card h3')
  await expect(titles.first()).toHaveText('Aaa 排序用例')
  await expect(titles.last()).toHaveText('Zzz 排序用例')
  await expect(page.locator('.score-list')).not.toContainText('评分')
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('排序用例')
  await expect(titles).toHaveText(['Aaa 排序用例', 'Zzz 排序用例'])
  await page.goto('/editor')
  await expect(page.getByRole('button', { name: '格式化', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '复杂度', exact: true })).toHaveCount(0)
})
