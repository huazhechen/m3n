import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test('numbered display ignores old staff preference and loads only the selected score without external resources', async ({ page, baseURL }) => {
  const external: string[] = [], requests: string[] = []
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation','0'))
  await page.route('**/*', async route => {
    const url=new URL(route.request().url())
    if (/^https?:$/.test(url.protocol) && url.origin!==new URL(baseURL!).origin) {
      external.push(url.href); return route.abort()
    }
    requests.push(url.pathname)
    return route.continue()
  })
  await page.goto('/scores/huan_le_song_01')
  const paper=page.locator('.score-paper')
  await expect(paper.locator('svg[data-engine="m3n"]')).toBeVisible()
  await expect(paper).toHaveAttribute('data-notation','numbered')
  await expect(page.getByRole('radio',{name:'五线谱',exact:true})).toHaveCount(0)
  expect(requests.filter(path=>/\.wasm$/.test(path))).toEqual([])
  await page.getByRole('button',{name:'播放',exact:true}).click()
  await expect(paper.locator('.is-playing').first()).toBeVisible({timeout:30_000})
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await page.getByRole('button',{name:'播放',exact:true}).click()
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  expect(external).toEqual([])
  const catalog = await (await page.request.get('/score-catalog.json')).json()
  const selected = catalog.scores.find((score: { slug: string }) => score.slug === 'huan_le_song_01')
  expect(requests.filter(path => path.endsWith('.m3n'))).toEqual(['/' + selected.sourceUrl])
  expect(requests.filter(path => path === '/score-catalog.json')).toHaveLength(1)
  expect(requests.filter(path=>/\.wasm$/.test(path))).toHaveLength(0)
})

test('editing and changing width refresh numbered layout',async({page})=>{
 await page.goto('/editor')
 const editor=page.getByLabel('M3N source'), paper=page.locator('.score-paper')
 await editor.fill('{title=原谱}{composer=测试作者}{equal-measures=true}{2/4}\nN: ||: 1 2 |\nB: 1d 2d |\nL1: 甲乙\nL2: 戊己\n---V1\nN: 3 4 :||\nB: 3d 4d |\nL: 丙丁\n---V2\nN: (5 6) 7 |||\nB: 3d 4d |\nL: 庚辛壬')
 await expect(paper).toContainText('原谱')
 await expect(paper.locator('[data-m3n-id="m3n-e-10"]').first()).toBeVisible()
 await paper.screenshot({path:'test-results/house-melody.png'})
 await page.getByRole('button',{name:'播放',exact:true}).click()
 await expect(paper.locator('[data-m3n-id^="m3n-e-"].is-playing').first()).toBeVisible({timeout:15_000})
 await page.getByRole('button',{name:'暂停',exact:true}).click()
 await editor.fill('{title=改谱}{4/4}\nN: 5 6 7 1e |||')
 await expect(paper).toContainText('改谱')
 await expect(paper.locator('[data-m3n-id="m3n-e-10"]')).toHaveCount(0)
 await openScoreSettings(page)
 await page.getByRole('slider',{name:'乐谱宽度'}).fill('600')
 await expect(paper.locator('svg[data-engine="m3n"]')).toHaveAttribute('viewBox',/^0 0 600 /)
})


test('catalog load failure offers a working retry', async ({ page }) => {
  let fail = true
  await page.route('**/score-catalog.json', route => fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await page.goto('/scores')
  await expect(page.getByText('曲库加载失败，请检查网络后重试。')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: '搜索乐谱' })).toBeVisible()
})
