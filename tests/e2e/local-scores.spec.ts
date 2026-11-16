import { expect, test } from '@playwright/test'

const source = '{title=本地测试}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('browse saves locally and edit reuses the score id', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page).toHaveURL(/\/scores\/local-/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/editor\/local-/)
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  const editorUrl = page.url()
  const revised = source.replace('本地测试', '本地测试修订')
  await page.getByLabel('M3N source').fill(revised)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL(editorUrl.replace('/editor/', '/scores/'))
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('m3n:local-scores') ?? '[]'))
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ source: revised, expiresAt: null })
})

test('recovers the latest draft after reload without file actions or a save notice', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('m3n:draft:new'))).not.toBeNull()
  await page.reload()
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  await expect(page.getByRole('status', { name: '草稿保存状态' })).toHaveCount(0)
  await expect(page.locator('.editor-header-right button')).toHaveText(['格式化', '保存', '分享'])
  await expect(page.getByLabel('导入 M3N 文件')).toHaveCount(0)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const name of ['格式化', '保存', '分享']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      await expect(button.locator('svg')).toBeVisible()
      if (width <= 720) {
        await expect(button.locator('span')).not.toBeVisible()
        expect((await button.boundingBox())!.width).toBe(36)
      } else await expect(button.locator('span')).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
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
  await page.getByRole('button', { name: '保存' }).click()
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
  await expect(page.locator('.score-paper').getByText('本地测试', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy','true')
  await page.getByRole('button', { name: '分享' }).click()

  await expect(page).toHaveURL(/\/scores\/[a-z0-9_]+_[0-9]{13}/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })
})

test('score library marks local scores, opens on click, and deletes', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存' }).click()
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

test('library puts recently modified local scores before alphabetized official scores', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('m3n:local-scores')) return
    localStorage.setItem('m3n:recent-edits', JSON.stringify([{ id: 'local-sort-0', title: '旧记录', updatedAt: Date.now() }]))
    localStorage.setItem('m3n:local-scores', JSON.stringify(['Zzz 排序用例', 'Aaa 排序用例', '旧版排序用例'].map((title, index) => ({
      id: `local-sort-${index}`,
      source: `{title=${title}} {4/4}\nN: 1 2 3 4 |||`,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: index < 2 ? `2021-01-0${2 - index}T00:00:00Z` : undefined,
      expiresAt: null,
    }))))
  })
  await page.goto('/scores')
  const titles = page.locator('.score-list .score-card h3')
  await expect(titles.nth(0)).toHaveText('Zzz 排序用例')
  await expect(titles.nth(1)).toHaveText('Aaa 排序用例')
  await expect(titles.nth(2)).toHaveText('旧版排序用例')
  const isLocal = await page.locator('.score-list .score-card').evaluateAll(cards => cards.map(card => card.classList.contains('is-local-card')))
  expect(isLocal.slice(0, 3)).toEqual([true, true, true])
  expect(isLocal.slice(3).every(local => !local)).toBe(true)
  await expect(page.getByRole('navigation', { name: '最近编辑' })).toHaveCount(0)
  await expect(page.locator('.score-list')).not.toContainText('评分')
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('排序用例')
  await expect(titles).toHaveText(['Zzz 排序用例', 'Aaa 排序用例', '旧版排序用例'])
  await page.goto('/editor/local-sort-1')
  await page.getByLabel('M3N source').fill('{title=Aaa 排序用例}{4/4}\nN: 4 3 2 1 |||')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/scores\/local-sort-1$/)
  await page.goto('/scores')
  await expect(titles.first()).toHaveText('Aaa 排序用例')
  await page.goto('/editor')
  await expect(page.getByRole('button', { name: '格式化', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '复杂度', exact: true })).toHaveCount(0)
})
