import { expect, test } from '@playwright/test'

for (const tone of ['synth', 'piano']) {
  test(`unlocks audio during the first gesture before lazy ${tone} loading, and after interruption`, async ({ page }) => {
    await page.addInitScript((tone) => {
      localStorage.setItem('m3n:playback-tone', tone)
      let inGesture = false
      for (const type of ['click', 'pointerdown']) {
        window.addEventListener(type, () => { inGesture = true }, true)
        window.addEventListener(type, () => { inGesture = false })
      }
      const NativeContext = window.AudioContext
      const contexts: AudioContext[] = []
      const unlocked = new WeakSet<AudioContext>()
      window.AudioContext = class extends NativeContext {
        constructor(options?: AudioContextOptions) { super(options); contexts.push(this) }
        resume() {
          // Enforce the iOS gesture requirement even when desktop WebKit permits autoplay.
          if (inGesture) unlocked.add(this)
          if (!unlocked.has(this)) return Promise.reject(new Error('Audio was not unlocked by a user gesture'))
          return super.resume()
        }
      }
      Object.assign(window, {
        interruptTestAudio: async () => {
          for (const context of contexts) { await context.suspend(); unlocked.delete(context) }
        },
        testAudioStates: () => contexts.map(context => context.state),
      })
    }, tone)
    await page.goto('/editor')
    await page.getByLabel('M3N source').fill('{4/4}{240qpm}\nN: 1 2 3 4 | 1 2 3 4 |||')
    await expect(page.locator('.score-paper g.note')).toHaveCount(8)
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await expect(page.locator('.score-paper .is-playing')).not.toHaveCount(0, { timeout: 30_000 })
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.evaluate(() => (window as unknown as { interruptTestAudio: () => Promise<void> }).interruptTestAudio())
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await expect(page.locator('.score-paper .is-playing')).not.toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { testAudioStates: () => string[] }).testAudioStates())).toEqual(['running'])
  })
}
