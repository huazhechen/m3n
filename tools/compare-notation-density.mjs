import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const root = resolve(import.meta.dirname, '..')
const output = resolve(argument('output') ?? '.tmp/notation-density')
const origin = 'http://notation-density.local'
if (process.argv.includes('--bundle-only')) {
  const { build } = await import('vite')
  await build({ configFile: false, logLevel: 'error', base: '/',
    define: { 'import.meta.url': JSON.stringify(`${origin}/bundle.js`) },
    build: { outDir: join(output, 'bundle'), emptyOutDir: true, minify: false,
      lib: { entry: join(root, 'tools/notation-density-layout.mjs'), name: 'notationDensity', formats: ['iife'], fileName: () => 'bundle.js' } } })
} else {
  mkdirSync(output, { recursive: true })
  // Release all bundler/font buffers before launching Chromium.
  execFileSync(process.execPath, [import.meta.filename, '--bundle-only', `--output=${output}`], { stdio: 'inherit' })
  const { chromium } = await import('@playwright/test')
  const files = (argument('scores') ?? 'huan_le_song_01,mo_li_hua_01,ni_shi_wo_xin_ai_de_gu_niang_01,flower_dance_01').split(',')
  const widths = (argument('widths') ?? '528,640,768').split(',').map(Number)
  if (widths.some(width => !Number.isFinite(width) || width < 320)) throw new Error('Invalid widths')
  const entries = []
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium'].find(existsSync) })
  try {
    const page = await browser.newPage()
    await page.route(`${origin}/**`, route => new URL(route.request().url()).pathname === '/'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN" style="font-synthesis:none"><body></body></html>' })
      : route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript' }))
    await page.goto(origin)
    await page.addScriptTag({ url: `${origin}/bundle.js` })
    for (const file of files) for (const width of widths) {
      const source = readFileSync(join(root, 'src/scores', `${file}.m3n`), 'utf8')
      const result = await page.evaluate(({ source, width }) => window.notationDensity.compare(source, width), { source, width })
      entries.push({ file, width, ...result })
      writeFileSync(join(output, 'report.json'), JSON.stringify({ entries }, null, 2) + '\n')
      console.log(`${file} ${width}px: numbered ${result.numbered.pages}p/${result.numbered.rows} rows; staff ${result.staff.pages}p/${result.staff.rows} rows`)
      if ([result.numbered, result.staff].some(value => value.outside.length || value.overlaps.length)) process.exitCode = 1
    }
  } finally { await browser.close() }
}
