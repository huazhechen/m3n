import { waitForEditor } from './editor-state'
import { expect, test } from '@playwright/test'
import { openScoreSettings, selectNotationMode } from './score-settings'

for (const notation of ['首调', '五线谱']) {
  test(`${notation} highlights each tuplet note with its own lyric`, async ({ page }) => {
    await page.goto('/editor')
    await waitForEditor(page)
    await page.getByLabel('M3N source').fill('{2/4}{60qpm}\nN: ||: [123:2] :|||\nL1: 春夏秋\nL2: 天地人')
    const paper = page.locator('.score-paper')
    await expect(paper.locator('svg').first()).toBeVisible()
    if (notation === '五线谱') {
      await openScoreSettings(page)
      await selectNotationMode(page, notation)
      await page.keyboard.press('Escape')
    }
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    for (const [slot, lyric] of [[0, '春'], [1, '夏'], [2, '秋']] as const) {
      await expect.poll(() => paper.evaluate((element, expected) => {
        const playing = [...element.querySelectorAll('g.note.is-playing')]
        const lyrics = [...element.querySelectorAll('[data-m3n-rendition].is-playing')].map(node => node.textContent)
        return playing.length === 1 && playing[0]!.getAttribute('data-m3n-tuplet-slot') === String(expected.slot)
          && lyrics.length > 0 && lyrics.every(text => text === expected.lyric)
          && !element.querySelector('g.tuplet.is-playing')
      }, { slot, lyric }), { timeout: 20_000, intervals: [25] }).toBe(true)
    }
    await page.getByRole('button', { name: '暂停', exact: true }).click()
  })
}
