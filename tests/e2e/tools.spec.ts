import { expect, test } from '@playwright/test'

test('harmonica diagram highlights scale notes and scores their connections', async ({ page }) => {
  await page.goto('/tools/scales')
  await expect(page.getByRole('heading', { name: '半音阶口琴·音阶与难度' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  const diagram = page.locator('.harmonica-diagram')
  await expect(diagram.locator('.harmonica-tile')).toHaveCount(48)
  const cSharp = diagram.locator('.harmonica-tile').filter({ has: page.locator('title', { hasText: /，1孔吹·按键/ }) })
  await expect(cSharp).toHaveAttribute('data-in-scale', 'false')
  await page.getByRole('button', { name: /^D♭大调，总分/ }).click()
  await expect(cSharp).toHaveAttribute('data-in-scale', 'true')
  await expect(cSharp.locator('text')).toHaveText('1')
  const routeCount = await diagram.locator('.scale-connections path').count()
  expect(routeCount).toBeGreaterThan(20)
  expect(await diagram.locator('.harmonica-muted-tiles').evaluate(element => !!(element.compareDocumentPosition(element.parentElement!.querySelector('.scale-connections')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  const edges = await diagram.locator('.scale-connections path').evaluateAll(paths => paths.map(path => ({ score: Number(path.getAttribute('data-score')), color: path.getAttribute('stroke') })))
  expect(edges.every(edge => edge.color === `hsl(${120 * (1 - Math.min(13, edge.score) / 13)} 65% 38%)`)).toBe(true)
  await expect(page.locator('.scale-route-details, .continuity-legend')).toHaveCount(0)
  await expect(page.getByText(/标准独奏音列|调内音加粗|替代音可断开连接|同吹吸偏绿/)).toHaveCount(0)
  const keyButtons = page.getByRole('group', { name: '选择大调' }).getByRole('button')
  await expect(keyButtons).toHaveCount(12)
  for (const button of await keyButtons.all()) await expect(button.locator('span')).toHaveText(/^\d+ 分$/)
})

test('all twelve keys remain usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tools/scales')
  const keys = page.getByRole('group', { name: '选择大调' }).getByRole('button')
  await expect(keys).toHaveCount(12)
  for (const key of await keys.all()) {
    await key.click()
    await expect(key).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.harmonica-tile')).toHaveCount(48)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const chart = page.getByRole('region', { name: '12 孔口琴音阶图', exact: true })
  expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const svg = chart.locator('svg')
  const bounds = (await svg.boundingBox())!
  expect(bounds.width).toBeGreaterThan(300)
  expect(bounds.width).toBeLessThan(320)
  expect(bounds.height / bounds.width).toBeCloseTo(312 / 618, 3)
  expect((await svg.locator('.harmonica-tile rect').first().boundingBox())!.width).toBeGreaterThan(21)
  await expect(svg.locator('.harmonica-row-labels text')).toHaveText(['按', '吹', '吸', '按'])
  const blocks = await svg.locator('.harmonica-tile rect').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right } }))
  expect(blocks.every(block => block.left >= 0 && block.right <= 320)).toBe(true)
  await page.getByRole('link', { name: '乐谱库', exact: true }).click()
  await page.getByRole('link', { name: '练琴工具', exact: true }).click()
  await page.getByRole('link', { name: '音阶图', exact: true }).click()
  await expect(page.getByRole('heading', { name: '半音阶口琴·音阶与难度' })).toBeVisible()
})


test('tool index contains only two tool entries and opens child routes', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.locator('.tools-catalog a')).toHaveText(['音阶图', '节拍器'])
  await expect(page.getByRole('heading')).toHaveCount(0)
  await expect(page.locator('.harmonica-diagram')).toHaveCount(0)
  await expect(page.getByText('看清孔位、吹吸与按键，找到更连贯的音阶连接。')).toHaveCount(0)
  await page.getByRole('link', { name: '音阶图', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/scales$/)
  await expect(page.locator('.harmonica-diagram')).toBeVisible()
  await expect(page.locator('.tools-catalog')).toHaveCount(0)
  await page.getByRole('link', { name: '练琴工具', exact: true }).click()
  await page.getByRole('link', { name: '节拍器', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/metronome$/)
  await expect(page.getByRole('heading', { name: '节拍器', exact: true })).toBeVisible()
  await expect(page.getByText('计划中', { exact: true })).toBeVisible()
})

test('major keys follow the circle of fifths and normalized score colors run from green to red', async ({ page }) => {
  await page.goto('/tools/scales')
  const keys = page.getByRole('group', { name: '选择大调' }).getByRole('button')
  await expect(keys).toHaveCount(12)
  expect(await keys.evaluateAll(buttons => buttons.map(button => button.firstChild!.textContent))).toEqual(['G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B'])
  const colors = await keys.evaluateAll(buttons => buttons.map(button => ({
    score: Number(button.querySelector('span')!.textContent!.match(/\d+/)![0]),
    rgb: getComputedStyle(button).backgroundColor.match(/\d+/g)!.map(Number),
  })))
  colors.sort((a, b) => a.score - b.score)
  expect(colors[0]!.rgb[0]).toBeLessThan(colors[0]!.rgb[1]!)
  expect(colors.at(-1)!.rgb[0]).toBeGreaterThan(colors.at(-1)!.rgb[1]!)
  for (let index = 1; index < colors.length; index++) {
    expect(colors[index]!.rgb[0]).toBeGreaterThanOrEqual(colors[index - 1]!.rgb[0]!)
    expect(colors[index]!.rgb[1]).toBeLessThanOrEqual(colors[index - 1]!.rgb[1]!)
    expect(colors[index]!.rgb[2]).toBe(colors[0]!.rgb[2])
  }
  await keys.last().click()
  await expect(keys.last()).toHaveAttribute('aria-pressed', 'true')
})

test('overlapping same-hole connections use separate lanes above the note tiles', async ({ page }) => {
  await page.goto('/tools/scales')
  await page.getByRole('button', { name: /^E♭大调，总分/ }).click()
  const connections = page.locator('.scale-connections')
  expect(await connections.evaluate(element => element === element.parentElement!.lastElementChild)).toBe(true)
  const pairs = await connections.locator('path').evaluateAll(paths => paths.filter(path => {
    const title = path.querySelector('title')!.textContent!
    return /^双向 [34] → [45]；3孔/.test(title)
  }).map(path => ({ title: path.querySelector('title')!.textContent!, x: (path as SVGPathElement).getPointAtLength(0).x })))
  expect(pairs).toHaveLength(2)
  const lower = pairs.find(pair => pair.title.startsWith('双向 3 → 4'))!
  const upper = pairs.find(pair => pair.title.startsWith('双向 4 → 5'))!
  expect(upper.x - lower.x).toBe(28)
})


test('C6 switch retunes blow notes, recomputes difficulty, and restores standard tuning', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tools/scales')
  const toggle = page.getByRole('switch', { name: 'C6', exact: true })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  const keys = page.getByRole('group', { name: '选择大调' }).getByRole('button')
  const standardScores = await keys.allTextContents()
  const standardLines = await page.locator('.scale-connections').innerHTML()
  const blow = (hole: number, pressed: boolean) => page.locator('.harmonica-tile').filter({ has: page.locator('title', { hasText: `，${hole}孔吹·${pressed ? '按键' : '松键'}` }) })
  for (const hole of [4, 8, 12]) await expect(blow(hole, false).locator('text')).toHaveText('1')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  for (const hole of [4, 8, 12]) {
    await expect(blow(hole, false).locator('text')).toHaveText('6')
    await expect(blow(hole, true).locator('text')).toHaveText('♭7')
  }
  expect(await keys.allTextContents()).not.toEqual(standardScores)
  expect(await page.locator('.scale-connections').innerHTML()).not.toEqual(standardLines)
  for (const key of await keys.all()) {
    await key.click()
    await expect(key).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.harmonica-tile')).toHaveCount(48)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const switchBounds = (await toggle.boundingBox())!
  const titleBounds = (await page.getByRole('heading', { name: '半音阶口琴·音阶与难度' }).boundingBox())!
  expect(switchBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width)
  await page.getByRole('button', { name: /^C大调，总分/ }).click()
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(await keys.allTextContents()).toEqual(standardScores)
  expect(await page.locator('.scale-connections').innerHTML()).toEqual(standardLines)
})


test('F major displays upper and lower 3–4–5 alternatives in C6 tuning', async ({ page }) => {
  await page.goto('/tools/scales')
  await page.getByRole('switch', { name: 'C6', exact: true }).click()
  await page.getByRole('button', { name: /^F大调，总分/ }).click()
  const paths = page.locator('.scale-connections path')
  for (const [degrees, actions] of [
    ['3 → 4', '4孔吹·松键 → 4孔吹·按键'],
    ['4 → 5', '4孔吹·按键 → 5孔吹·松键'],
    ['3 → 4', '3孔吸·松键 → 3孔吸·按键'],
    ['4 → 5', '3孔吸·按键 → 4孔吸·按键'],
  ]) {
    await expect(paths.filter({ has: page.locator('title', { hasText: `双向 ${degrees}；${actions}` }) })).toHaveCount(1)
  }
})
