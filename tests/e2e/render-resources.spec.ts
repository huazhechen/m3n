import { expect, test } from '@playwright/test'

test('numbered display ignores old staff preference and only loads playback resources on play', async ({ page, baseURL }) => {
  const external: string[] = [], requests: string[] = []
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation','0'))
  await page.route('**/*', async route => {
    const url=new URL(route.request().url())
    if (/^https?:$/.test(url.protocol) && url.origin!==new URL(baseURL!).origin) {
      external.push(url.href); return route.abort()
    }
    requests.push(url.pathname); return route.continue()
  })
  await page.goto('/scores/huan_le_song_01')
  const paper=page.locator('.score-paper')
  await expect(paper.locator('svg[data-engine="jpfun"]')).toBeVisible()
  await expect(paper).toHaveAttribute('data-notation','numbered')
  await expect(page.getByRole('radio',{name:'五线谱',exact:true})).toHaveCount(0)
  expect(requests.filter(path=>/playback-score-|\.wasm$/.test(path))).toEqual([])
  await page.getByRole('button',{name:'播放',exact:true}).click()
  await expect(paper.locator('.is-playing').first()).toBeVisible({timeout:30_000})
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await page.getByRole('button',{name:'播放',exact:true}).click()
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  expect(external).toEqual([])
  expect(requests.filter(path=>/playback-score-/.test(path))).toHaveLength(1)
  expect(requests.filter(path=>/\.wasm$/.test(path))).toHaveLength(1)
})

test('editing and changing width refresh numbered layout',async({page})=>{
 await page.goto('/editor')
 const editor=page.getByLabel('M3N source'), paper=page.locator('.score-paper')
 await editor.fill('{title=原谱}{2/4}{120qpm}\nN: ||: 1 2 | 3 4 :||\nL1: 甲乙 | 丙丁\nL2: 戊己 | 庚辛壬\nNs[2]: 2: (5 6) 7 |')
 await expect(paper).toContainText('原谱')
 await expect(paper.locator('[data-m3n-id="m3n-e-a1-1"]').first()).toBeVisible()
 await paper.screenshot({path:'test-results/alternative-melody.png'})
 await page.getByRole('button',{name:'播放',exact:true}).click()
 await expect(paper.locator('[data-m3n-id^="m3n-e-a"].is-playing').first()).toBeVisible({timeout:15_000})
 await page.getByRole('button',{name:'暂停',exact:true}).click()
 await editor.fill('{title=改谱}{4/4}\nN: 5 6 7 1e |||')
 await expect(paper).toContainText('改谱')
 await expect(paper.locator('[data-m3n-id="m3n-e-a1-1"]')).toHaveCount(0)
 await page.getByRole('slider',{name:'乐谱宽度'}).fill('600')
 await expect(paper.locator('svg[data-engine="jpfun"]')).toHaveAttribute('viewBox',/^0 0 600 /)
})
