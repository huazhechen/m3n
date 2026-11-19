import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
  test(`top navigation exposes ordered score actions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/scores/huan_le_song_01')
    const header = page.locator('.top-nav')
    const nav = page.getByRole('navigation', { name: '主导航' })
    await expect(nav.getByRole('button', { name: '打印', exact: true })).toBeVisible()
    await expect(nav.locator('a, button, [aria-disabled="true"]')).toHaveCount(5)
    expect(await nav.locator('a, button, [aria-disabled="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))))
      .toEqual(['上一曲', '下一曲', '打印', '编辑', '乐谱库'])
    await expect(page.getByRole('button', { name: '页面菜单' })).toHaveCount(0)
    for (const name of ['上一曲', '下一曲', '打印', '编辑', '乐谱库']) {
      const action = nav.getByLabel(name, { exact: true })
      await expect(action).toBeVisible()
      await expect(action.locator('svg')).toBeVisible()
      if (width <= 720) await expect(action.locator('.nav-action-label')).toBeHidden()
      else await expect(action.locator('.nav-action-label')).toBeVisible()
    }
    const bounds = await header.boundingBox()
    const shortSide = Math.min(width, 900)
    expect(bounds!.height).toBeCloseTo(Math.min(36, Math.max(24, shortSide / 16)) * 1.25, 0)
    const buttons = await nav.locator('a, button, [aria-disabled="true"]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top }
    }))
    expect(buttons.every(button => button.left >= 0 && button.right <= width)).toBe(true)
    expect(new Set(buttons.map(button => button.top)).size).toBe(1)
    await header.screenshot({ path: info.outputPath('top-navigation.png') })
    await nav.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.getByRole('button', { name: '关闭导出' })).toBeVisible()
    await page.getByRole('button', { name: '关闭导出' }).click()
    const next = await nav.getByRole('link', { name: '下一曲', exact: true }).getAttribute('href')
    await nav.getByRole('link', { name: '下一曲', exact: true }).click()
    await expect(page).toHaveURL(next!)
    await expect(nav.getByRole('link', { name: '编辑', exact: true })).toHaveAttribute('href', next!.replace('/scores/', '/editor/'))
    await nav.getByRole('link', { name: '乐谱库', exact: true }).click()
    await expect(page).toHaveURL(/\/scores$/)
  })
}

for (const width of [390, 1280]) {
  test(`home and reading pages show only the library action at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/?doc=guide', '/?doc=manual']) {
      await page.goto(route)
      const nav = page.getByRole('navigation', { name: '主导航' })
      await expect(nav.locator('a, button')).toHaveCount(1)
      await expect(nav.getByRole('link', { name: '乐谱库', exact: true })).toBeVisible()
      if (route !== '/') {
        await expect(page.locator('.markdown-panel')).toBeVisible()
        await expect(page.locator('.hero, .hero-actions')).toHaveCount(0)
        await expect(page.getByRole('link', { name: '返回首页', exact: true })).toHaveCount(0)
      }
    }
  })
}
