import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'

const filter=process.argv.find(a=>a.startsWith('--score='))?.slice(8)
const root = resolve(import.meta.dirname, '..'),
  output = join(root, '.tmp/staff-layout-audit/verification-' + (filter??'all'))
mkdirSync(output, { recursive: true })
await build({
  configFile: false,
  logLevel: 'error',
  base: '/',
  define: { 'import.meta.url': JSON.stringify('http://staff-audit.local/bundle.js') },
  build: {
    outDir: join(output, 'bundle'),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: join(root, 'tools/staff-width-layout.mjs'),
      name: 'staffWidths',
      formats: ['iife'],
      fileName: () => 'bundle.js',
    },
  },
})
const inputs = ['scores', 'works']
  .flatMap((scope) =>
    readdirSync(join(root, 'src', scope))
      .filter((f) => f.endsWith('.m3n'))
      .map((file) => ({ file: `${scope}/${file}`, source: readFileSync(join(root, 'src', scope, file), 'utf8') })),
  )
  .filter((item) => !filter || item.file.includes(filter))
const fixtures = [
  { file: 'fixture/short-breaks', source: '{4/4}\n===A\nN: 1 2 3 4 | {br}5 6 7 1e |\n===B{br}\nN: 1 2 3 4 |||' },
  {
    file: 'fixture/equal-measures',
    source: '{equal-measures=true}{4/4}\nN: 1^^ | (1 2) (3 4) (5 6) (7 1e) | 1 2 3 4 |||',
  },
  {
    file: 'fixture/long-lyrics',
    source:
      '{title=长标题长标题长标题长标题长标题长标题长标题}{4/4}\nN: 1 2 3 4 | {br}5 6 7 1e |||\nL: Extraordinary extraordinarily extraordinary extraordinary | Spring summer autumn winter',
  },
  {
    file: 'fixture/bass-lyrics',
    source: '{4/4}\nN: ||: 1 2 3 4 | {br}5 6 7 1e :|||{x8}\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |\n' +
      Array.from({length: 8}, (_,i) => `L${i+1}: 春夏秋冬 | 山川天地`).join('\n'),
  },
  {
    file: 'fixture/long-section',
    source: `{title=长段名与顺序}{4/4}{order=${'很长的段落名称'.repeat(12)}}\n===${'很长的段落名称'.repeat(12)}\nN: 1 2 3 4 |||`,
  },
]
const entries = []
for (const input of [...fixtures.filter(item => !filter || item.file.includes(filter)), ...inputs]) {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.route('http://staff-audit.local/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/')
        return route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html lang="zh-CN"><body></body></html>',
        })
      if (path === '/verovio-module.wasm')
        return route.fulfill({
          path: join(root, 'packages/score-renderer/vendor/verovio/verovio-module.wasm'),
          contentType: 'application/wasm',
        })
      return route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
    })
    await page.goto('http://staff-audit.local/')
    await page.addScriptTag({ url: 'http://staff-audit.local/bundle.js' })
    const width = Number(/\{staff-preferred-width=(\d+)\}/.exec(input.source)?.[1] ?? 640)
    const result = await page.evaluate(
      async ({ source, width }) => {
        await window.staffWidths.prepare()
        return window.staffWidths.measure(source, width, true)
      },
      { ...input, width },
    )
    entries.push({ file: input.file, ...result })
    console.log(input.file, result.pageCount, result.outside.length, result.overlaps.length)
    if(result.outside.length||result.overlaps.length){
      const svgs=await page.evaluate(({source,width})=>window.staffWidths.preview(source,width),{...input,width})
      const name=input.file.replaceAll('/','_')
      svgs.forEach((svg,i)=>writeFileSync(join(output,`${name}-${i+1}.svg`),svg))
      await page.screenshot({path:join(output,`${name}.png`),fullPage:true})
    }
  } catch (error) {
    entries.push({ file: input.file, error: String(error) })
    console.error(input.file, String(error))
  } finally {
    await browser.close()
  }
  writeFileSync(join(output, 'report.json'), JSON.stringify({ entries }, null, 2) + '\n')
}
if (entries.some((item) => item.error || item.outside.length || item.overlaps.length)) process.exitCode = 1
