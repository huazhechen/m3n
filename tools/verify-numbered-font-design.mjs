import { chromium, webkit, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = resolve(argument('output') ?? '.tmp/numbered-font-design')
const origin = 'http://numbered-font-design.local'
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'entry.ts'), `export * from ${JSON.stringify(resolve('tools/numbered-font-design-layout.mjs'))}\n`)
execFileSync(process.execPath, ['tools/build-numbered-audit-bundle.mjs', output], { stdio: 'inherit' })
const fonts = JSON.parse(readFileSync('tools/fonts/library/manifest.json', 'utf8')).fonts
for (const font of fonts) assert.equal(createHash('sha256').update(readFileSync(join('tools/fonts/library', font.file))).digest('hex'), font.sha256)
const fixtures = ['ban_yin_jie_kou_qin_ji_ben_gong_01', 'meng_huan_qu_01', 'ai_de_li_zan_01']
const report = { complete: false, fontHashes: fonts.map(({ file, sha256 }) => ({ file, sha256 })), entries: [] }
const save = () => writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
for (const engine of ['chromium', 'webkit']) {
  const browser = await (engine === 'chromium' ? chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
    args: ['--disable-gpu', '--renderer-process-limit=1', '--disable-features=SpareRendererForSitePerProcess', '--js-flags=--max-old-space-size=256'] })
    : webkit.launch({ headless: true, executablePath: argument('webkit-executable') }))
  try { for (const form of ['desktop', 'tablet']) {
    const context = await browser.newContext(form === 'tablet' ? { ...devices['iPad Mini'] } : {})
    try {
      const page = await context.newPage()
      await page.route(origin + '/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><html style="font-synthesis:none"><body></body></html>' })
        const font = fonts.find(font => path === '/fonts/' + font.file)
        assert(font, `Unexpected request: ${path}`)
        return route.fulfill({ path: join('tools/fonts/library', font.file), contentType: 'font/ttf' })
      })
      await page.goto(origin)
      await page.addScriptTag({ content: readFileSync(join(output, 'bundle/bundle.js'), 'utf8') })
      await page.evaluate(fonts => m3n.initialize(fonts), fonts.map(font => ({ ...font, url: origin + '/fonts/' + font.file })))
      const exported = await page.evaluate(() => m3n.exportStyle())
      assert.equal(exported.stroke, 'rgb(0, 0, 0)')
      assert.equal(exported.width, 15)
      assert.equal(exported.join, 'round')
      assert.match(exported.transform, /^matrix\(1 0 -0\.212556/)
      const pdf = await PDFDocument.load(Uint8Array.from(exported.pdf))
      const contents = pdf.getPage(0).node.Contents()
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref, PDFRawStream)) : [contents]
      const operators = streams.map(stream => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join('\n')
      assert.match(operators, /2 Tr\s+0\.36 w/)
      assert.match(operators, /1 j\s+BT/)
      for (const fixture of process.argv.includes('--exports-only') ? [] : fixtures) {
        const result = await page.evaluate(source => m3n.parity(source), readFileSync(`src/scores/${fixture}.m3n`, 'utf8'))
        writeFileSync(join(output, 'latest.json'), JSON.stringify({ engine, form, fixture, result }, null, 2))
        assert.equal(result.outside.length + result.overlaps.length, 0, `${engine} ${form} ${fixture} ink`)
        assert.equal(result.numbersVisible.width, result.width, 'Measure number visibility changed width')
        assert.deepEqual(result.numbersVisible.quality, result.quality, 'Measure number visibility changed scoring')
        assert.deepEqual(result.numbersVisible.geometry, result.geometry, 'Measure number visibility changed layout')
        const previous = report.entries.find(entry => entry.fixture === fixture)
        if (previous) assert.deepEqual(result, previous.result, `${engine} ${form} ${fixture} design layout diverged`)
        if (fixture.includes('ji_ben_gong')) {
          const groups = result.geometry.measureRows.filter(row => row.some(id => [67, 68, 69, 70].includes(Number(id.split('-').at(-1)))))
          assert.deepEqual(groups.map(row => row.map(id => Number(id.split('-').at(-1)))), [[67, 68], [69, 70]])
        }
        report.entries.push({ engine, form, fixture, result }); save()
        console.log(`${engine} ${form} ${fixture}: ${result.width}px / ${result.pages}p / ${result.rows} rows`)
      }
    } finally { await context.close() }
  } } finally { await browser.close() }
}
report.complete = true; save()
