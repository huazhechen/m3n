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


test('backgrounding keeps the metronome running and local storage failures are reported', async ({ page }) => {
  await page.goto('/tools/metronome')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await expect(page.getByLabel('今日练习时长')).not.toHaveText('00:00:00')
  await page.getByRole('button', { name: '暂停', exact: true }).click()
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

test('tempo buttons support single steps and holding, and stop on release, leaving or reaching a limit', async ({ page }) => {
  await page.goto('/tools/metronome')
  const slider = page.getByRole('slider', { name: '速度', exact: true })
  const plus = page.getByRole('button', { name: '速度增加 1 BPM' })
  const minus = page.getByRole('button', { name: '速度减少 1 BPM' })
  await plus.click()
  await expect(slider).toHaveValue('61')
  await plus.focus()
  await page.keyboard.press('Enter')
  await expect(slider).toHaveValue('62')
  await plus.hover()
  await page.mouse.down()
  await page.waitForTimeout(750)
  await page.mouse.up()
  const held = Number(await slider.inputValue())
  expect(held).toBeGreaterThan(65)
  await page.waitForTimeout(200)
  await expect(slider).toHaveValue(String(held))
  await minus.hover()
  await page.mouse.down()
  await page.waitForTimeout(550)
  expect(Number(await slider.inputValue())).toBeLessThan(held)
  await page.mouse.move(0, 0)
  const left = await slider.inputValue()
  await page.waitForTimeout(200)
  await expect(slider).toHaveValue(left)
  await page.mouse.up()
  for (const [value, button, bound] of [['359', plus, '360'], ['11', minus, '10']] as const) {
    await slider.fill(value)
    await button.hover()
    await page.mouse.down()
    await page.waitForTimeout(600)
    await page.mouse.up()
    await expect(slider).toHaveValue(bound)
    await expect(button).toBeDisabled()
  }
})

test('tempo defaults to 60 and restores slider and button adjustments on reopening', async ({ page }) => {
  await page.goto('/tools/metronome')
  const slider = page.getByRole('slider', { name: '速度', exact: true })
  await expect(slider).toHaveValue('60')
  await slider.fill('123')
  await page.reload()
  await expect(slider).toHaveValue('123')
  await page.getByRole('button', { name: '速度增加 1 BPM' }).click()
  await page.getByRole('link', { name: '练琴工具', exact: true }).click()
  await page.getByRole('link', { name: '节拍器', exact: true }).click()
  await expect(slider).toHaveValue('124')
  for (const invalid of ['garbage', '9', '361', '60.5']) {
    await page.evaluate(value => localStorage.setItem('m3n:metronome-bpm', value), invalid)
    await page.reload()
    await expect(slider).toHaveValue('60')
  }
})

test('tempo remains usable when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw Error('blocked') }
    Storage.prototype.setItem = () => { throw Error('blocked') }
  })
  await page.goto('/tools/metronome')
  const slider = page.getByRole('slider', { name: '速度', exact: true })
  await expect(slider).toHaveValue('60')
  await page.getByRole('button', { name: '速度增加 1 BPM' }).click()
  await expect(slider).toHaveValue('61')
  await slider.fill('180')
  await expect(page.getByLabel('当前速度')).toHaveText('180')
})

test('tempo button hit areas fill both sides of the centered number on desktop and mobile', async ({ page }) => {
  for (const width of [1000, 320]) {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('/tools/metronome')
    const row = (await page.locator('.metronome-tempo').boundingBox())!
    const number = (await page.getByLabel('当前速度').boundingBox())!
    const minus = page.getByRole('button', { name: '速度减少 1 BPM' })
    const plus = page.getByRole('button', { name: '速度增加 1 BPM' })
    const left = (await minus.boundingBox())!
    const right = (await plus.boundingBox())!
    expect(left.x).toBeCloseTo(row.x, 0)
    expect(right.x + right.width).toBeCloseTo(row.x + row.width, 0)
    expect(left.height).toBeCloseTo(row.height, 0)
    expect(number.x + number.width / 2).toBeCloseTo(row.x + row.width / 2, 0)
    await minus.click({ position: { x: 2, y: left.height / 2 } })
    await expect(page.getByLabel('当前速度')).toHaveText('59')
    const updatedRight = (await plus.boundingBox())!
    await plus.click({ position: { x: updatedRight.width - 2, y: updatedRight.height / 2 } })
    await expect(page.getByLabel('当前速度')).toHaveText('60')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('audible beats stay regular while the main thread cannot schedule callbacks', async ({ page }) => {
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this)
      const capture = this.createMediaStreamDestination()
      const recorder = new MediaRecorder(capture.stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = event => chunks.push(event.data)
      const recording = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType })) })
      Object.assign(window, { stopRecording: () => { recorder.stop(); return recording } })
      source.connect(capture)
      recorder.start()
      return source
    }
  })
  await page.goto('/tools/metronome')
  await page.getByRole('slider', { name: '速度', exact: true }).fill('120')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await page.waitForTimeout(300) // Allow the recorder's asynchronous startup to finish.
  const onsets = await page.evaluate(async () => {
    // A blocked main thread is stricter than background timer throttling.
    const until = performance.now() + 2200
    while (performance.now() < until) { /* No timer or animation callback can run. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
    const recording = await (window as unknown as { stopRecording: () => Promise<Blob> }).stopRecording()
    const decoder = new AudioContext()
    const audio = await decoder.decodeAudioData(await recording.arrayBuffer())
    const data = audio.getChannelData(0)
    const onsets: number[] = []
    let lastLoudFrame = -audio.sampleRate
    for (let frame = 0; frame < data.length; frame++) {
      if (Math.abs(data[frame]!) > .1) {
        if (frame - lastLoudFrame > audio.sampleRate * .12) onsets.push(frame / audio.sampleRate)
        lastLoudFrame = frame
      }
    }
    await decoder.close()
    return onsets
  })
  expect(onsets.length).toBeGreaterThanOrEqual(4)
  for (let index = 1; index < onsets.length; index++) expect(Math.abs(onsets[index]! - onsets[index - 1]! - .5)).toBeLessThan(.025)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})
