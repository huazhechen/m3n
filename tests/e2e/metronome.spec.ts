import { expect, test } from '@playwright/test'

test('metronome adjusts tempo, meter and accents during playback', async ({ page }) => {
  await page.addInitScript(() => {
    const events: { duration: number; loop: boolean; tones: number[][] }[] = []
    Object.assign(window, { metronomeEvents: events })
    const original = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this)
      const start = source.start.bind(source)
      source.start = (when = 0, offset = 0) => {
        const buffer = source.buffer!
        const data = buffer.getChannelData(0)
        events.push({ duration: buffer.duration, loop: source.loop, tones: [0, .5, 1].map(time => Array.from(data.slice(Math.round(time * buffer.sampleRate), Math.round(time * buffer.sampleRate) + 100))) })
        start(when, offset)
      }
      return source
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
  const sounds = await page.evaluate(() => (window as unknown as { metronomeEvents: { duration: number; loop: boolean; tones: number[][] }[] }).metronomeEvents)
  expect(sounds).toHaveLength(1)
  expect(sounds[0]!.loop).toBe(true)
  expect(sounds[0]!.duration).toBeCloseTo(1.5, 3)
  expect(sounds[0]!.tones[0]).toEqual(sounds[0]!.tones[1])
  expect(sounds[0]!.tones[0]).not.toEqual(sounds[0]!.tones[2])
  await tempo.fill('240')
  await expect.poll(() => page.evaluate(() => (window as unknown as { metronomeEvents: { duration: number }[] }).metronomeEvents.at(-1)!.duration)).toBeCloseTo(.75, 3)
  await page.getByRole('button', { name: '6 拍', exact: true }).click()
  await expect(beats).toHaveCount(6)
  await expect(beats.nth(3)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('今日练习时长')).not.toHaveText('00:00:00')
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
