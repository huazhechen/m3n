import { expect, type Locator, type Page } from '@playwright/test'

export async function waitForEditor(page: Page, allowRenderError = false) {
  const paper = page.locator('.score-paper')
  await expect(page.locator(allowRenderError ? '.score-paper svg, .render-message' : '.score-paper svg').first()).toBeAttached({ timeout: 30_000 })
  await expect(page.getByRole('status', { name: '乐谱分析状态' })).toHaveCount(0)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.playback-loading-dialog[open]')).toHaveCount(0)
}

export async function selectionStart(editor: Locator) {
  return editor.evaluate(element => Reflect.get(element, 'cmTile').root.view.state.selection.main.from as number)
}
