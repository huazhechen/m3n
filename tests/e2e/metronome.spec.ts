import { expect, test } from '@playwright/test'

test('metronome adjusts tempo, meter and accents during playback', async ({ page }) => {
  await page.addInitScript(() => {
    const events: { frequency: number; time: number }[] = []
    Object.assign(window, { metronomeEvents: events })
    const original = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      const oscillator = original.call(this)
      const start = oscillator.start.bind(oscillator)
      oscillator.start = (when = 0) => { events.push({ frequency: oscillator.frequency.value, time: when }); start(when) }
      return oscillator
    }

  })
  await page.goto('/tools/metronome')
  const tempo = page.getByRole('slider', { name: '速度', exact: true })
  await tempo.fill('120')
  await expect(page.getByLabel('当前速度')).toHaveText('120')
  await page.getByRole('button', { name: '3 拍', exact: true }).click()
  const beats = page.getByRole('group', { name: '重音设置' }).getByRole('button')
  await expect(beats).toHaveCount(3)
  await expect(beats.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(beats.nth(1)).toHaveAttribute('aria-pressed', 'false')
  await beats.nth(1).click()
  await expect(beats.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { metronomeEvents: unknown[] }).metronomeEvents.length)).toBeGreaterThanOrEqual(4)
  const sounds = await page.evaluate(() => (window as unknown as { metronomeEvents: { frequency: number; time: number }[] }).metronomeEvents)
  expect(sounds.slice(0, 3).map(sound => sound.frequency)).toEqual([1500, 1500, 900])
  expect(sounds[1]!.time - sounds[0]!.time).toBeCloseTo(.5, 3)
  await tempo.fill('240')
  await expect.poll(async () => {
    const sounds = await page.evaluate(() => (window as unknown as { metronomeEvents: { time: number }[] }).metronomeEvents)
    return sounds.length > 5 ? Math.round((sounds.at(-1)!.time - sounds.at(-2)!.time) * 1000) : 0
  }).toBe(250)
  await page.getByRole('button', { name: '6 拍', exact: true }).click()
  await expect(beats).toHaveCount(6)
  await expect(beats.nth(3)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('[data-active=true]')).toHaveCount(0)
  await expect(page.getByLabel('今日练习时长')).not.toHaveText('00:00:00')
  const saved = await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))).toBe(saved)
  await expect(page.getByLabel('累计练习时长')).not.toHaveText('00:00:00')
  await page.getByText('每日记录', { exact: true }).click()
  await expect(page.locator('.practice-history li')).toHaveCount(1)
})

test('mobile controls fit and leaving the page stops practice accounting', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tools/metronome')
  for (const meter of [2, 4, 3, 6]) {
    await page.getByRole('button', { name: `${meter} 拍`, exact: true }).click()
    await expect(page.getByRole('group', { name: '重音设置' }).getByRole('button')).toHaveCount(meter)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByLabel('今日练习时长')).not.toHaveText('00:00:00')
  await page.getByRole('link', { name: '练琴工具', exact: true }).click()
  await expect(page.locator('.tools-catalog')).toBeVisible()
  const saved = await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))
  await page.getByRole('link', { name: '节拍器', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))).toBe(saved)
})


test('backgrounding pauses the metronome and local storage failures are reported', async ({ page }) => {
  await page.goto('/tools/metronome')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: '开始', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    Storage.prototype.setItem = () => { throw Error('blocked') }
  })
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('未允许本地保存')
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('m3n:metronome-practice-v1'))).toBe(saved)
})
