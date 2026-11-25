import { expect, test } from '@playwright/test'
import { openScoreSettings, selectNotationMode } from './score-settings'

test('staff loading dialog spans the module download and stays silent after initialization', async ({ page }) => {
  let releaseModule!: () => void
  const moduleGate = new Promise<void>(resolve => { releaseModule = resolve })
  await page.route('**/staff-score-*.js', async route => { await moduleGate; await route.continue() })
  await page.goto('/scores/huan_le_song_01')
  const loading = page.getByRole('dialog', { name: '加载五线谱资源', exact: true })
  await expect(loading).toHaveCount(0)
  const moduleRequest = page.waitForRequest(request => /\/staff-score-[^/]+\.js$/.test(request.url()))
  await selectNotationMode(page, '五线谱')
  await moduleRequest
  await expect(loading).toBeVisible()
  await expect(loading.getByRole('progressbar', { name: '五线谱资源加载进度' })).not.toHaveAttribute('value')
  await loading.getByRole('button', { name: '后台加载', exact: true }).click()
  await expect(loading).not.toBeVisible()
  releaseModule()
  await expect(page.locator('.score-paper g.staff').first()).toBeVisible()
  await expect(loading).toHaveCount(0)
  await page.evaluate(() => {
    Object.assign(window, { resourceDialogs: 0 })
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('.playback-loading-dialog') || node.querySelector('.playback-loading-dialog'))) {
          (window as Window & { resourceDialogs: number }).resourceDialogs++
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
  await selectNotationMode(page, '首调')
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  await selectNotationMode(page, '五线谱')
  await expect(page.locator('.score-paper g.staff').first()).toBeVisible()
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '乐谱宽度' }).fill('25')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  expect(await page.evaluate(() => (window as Window & { resourceDialogs: number }).resourceDialogs)).toBe(0)
})

test('failed staff resources dismiss the dialog and can be retried after returning to numbered notation', async ({ page }) => {
  const staffModule = '**/staff-score-*.js'
  await page.route(staffModule, route => route.abort())
  await page.goto('/scores/huan_le_song_01')
  await selectNotationMode(page, '五线谱')
  await expect(page.locator('.render-message')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '加载五线谱资源', exact: true })).toHaveCount(0)
  await selectNotationMode(page, '首调')
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  await page.unroute(staffModule)
  await selectNotationMode(page, '五线谱')
  await expect(page.locator('.score-paper g.staff').first()).toBeVisible()
  await expect(page.locator('.render-message')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '加载五线谱资源', exact: true })).toHaveCount(0)
})
