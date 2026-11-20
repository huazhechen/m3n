import { expect, test } from '@playwright/test'
import { selectNotationMode, openScoreSettings } from './score-settings'

test('staff layout respects hard boundaries and keeps identical horizontal geometry across pagination', async ({
  page,
}) => {
  await page.goto('/editor')
  await page
    .getByLabel('M3N source')
    .fill(
      '{title=布局一致性}{4/4}\n===A\nN: 1 2 3 4 | {br}5 6 7 1e |\n===B{br}\nN: 1 2 3 4 |||',
    )
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('g.system')).toHaveCount(3)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const horizontal = () =>
    paper.locator('g.note[id] .notehead').evaluateAll((nodes) =>
      nodes.map((node) => {
        const svg = node.ownerSVGElement!,
          matrix = svg.getCTM()!.inverse().multiply(node.getCTM()!),
          box = node.getBBox()
        return {
          id: node.parentElement!.id,
          x: matrix.a * box.x + matrix.c * box.y + matrix.e,
          width: box.width * matrix.a,
        }
      }),
    )
  const lines = await paper.locator('g.staff').first().locator(':scope > path').evaluateAll(paths => paths.filter(p => {
    const b = (p as SVGGraphicsElement).getBBox()
    return b.width > 100 && b.height === 0 && getComputedStyle(p).stroke !== 'none'
  }).length)
  expect(lines).toBe(5)
  const before = await horizontal()
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const after = await horizontal()
  expect(after.map(n => n.id)).toEqual(before.map(n => n.id))
  for (const [i, note] of after.entries()) {
    expect(note.x).toBeCloseTo(before[i]!.x, 5)
    expect(note.width).toBeCloseTo(before[i]!.width, 5)
  }
  expect(await paper.locator('g.reh rect').count()).toBe(2)
  expect(await paper.locator('svg use,svg svg,svg defs').count()).toBe(0)
})

test('staff equal-measure mode changes positions without changing notehead sizes', async ({ page }) => {
  await page.goto('/editor')
  const source =
    '{equal-measures=true}{4/4}\nN: 1^^ | (1 2) (3 4) (5 6) (7 1e) | 1 2 3 4 |||'
  await page.getByLabel('M3N source').fill(source.replace('{equal-measures=true}', ''))
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const sizes = () => paper.locator('g.note .notehead').evaluateAll((nodes) =>
    nodes.map((n) => (n as SVGGraphicsElement).getBBox().width))
  const before = await sizes()
  await page.getByLabel('M3N source').fill(source)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const rows = await paper.locator('g.system').evaluateAll((systems) =>
    systems.map((system) =>
      [...system.querySelectorAll('g.measure')].map((measure) => {
        const path = measure.querySelector('g.staff > path') as SVGGraphicsElement
        return path.getBBox().width
      }),
    ),
  )
  for (const row of rows) expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(3)
  const after = await sizes()
  expect(after).toHaveLength(before.length)
  for (const [i, size] of after.entries()) expect(size).toBeCloseTo(before[i]!, 3)
})

test('multiple lyric verses reopen the complete grand staff including connecting barlines', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(
    '{4/4}\nN: ||: 1 2 3 4 | {br}5 6 7 1e :|||{x8}\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |\n' +
    Array.from({ length: 8 }, (_, i) => `L${i + 1}: 春夏秋冬 | 山川天地`).join('\n'),
  )
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('g.verse text')).toHaveCount(64)
  const gaps = await paper.locator('g.measure').evaluateAll((measures) => measures.map((measure) => {
    const staff = [...measure.querySelectorAll(':scope > g.staff')].at(-1)!
    const bottom = Math.max(...[...staff.querySelectorAll(':scope > path')].map((p) => p.getBoundingClientRect().bottom))
    const bar = Math.max(...[...measure.querySelectorAll('g.barLine path')].map((p) => p.getBoundingClientRect().bottom))
    return Math.abs(bar - bottom)
  }))
  for (const gap of gaps) expect(gap).toBeLessThan(1)
})

test('an oversized header still renders continuously and reports an A4 pagination error', async ({ page }) => {
  await page.goto('/editor')
  await selectNotationMode(page, '五线谱')
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('M3N source').fill(`{title=${'长标题'.repeat(200)}}{4/4}\nN: 1 2 3 4 |||`)
  const paper = page.locator('.score-paper')
  await expect(paper.locator('g.system')).toHaveCount(1)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  expect(Number(await paper.locator(':scope > svg').getAttribute('height'))).toBeGreaterThan(500)
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await expect(page.locator('.render-message')).toContainText('单个五线谱谱行')
})
