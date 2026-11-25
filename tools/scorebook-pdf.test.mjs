import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { buildBrowserTestBundle } from './lib/browser-test-bundle.mjs'
import { browserTestFontAssets } from './lib/browser-test-font-assets.mjs'

test('vector scorebook PDF keeps the version and omits only front-page footers', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-book-pdf-'))
  const assets = browserTestFontAssets(root)
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export { scorebookFrontPages } from ${JSON.stringify(join(root, 'src/lib/scorebook-front.ts'))}; export { vectorScorePdf } from ${JSON.stringify(join(root, 'packages/score-renderer/src/score-pdf.ts'))}; export { prepareNumberedNotationFonts } from ${JSON.stringify(join(root, 'packages/numbered-notation/dist/index.js'))};`)
    await buildBrowserTestBundle({ root, entry, outDir: join(temp, 'bundle') })
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
      args: ['--disable-gpu', '--single-process', '--no-zygote', '--js-flags=--max-old-space-size=256'] })
    const page = await browser.newPage()
    await page.route('**/*', async route => await assets.fulfill(route) ? undefined : new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ path: join(temp, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body></body>' }))
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({ url: 'http://scorebook.local/bundle.js' })
    const bytes = await page.evaluate(async () => {
      const plan = { title: 'Book', version: 'a1b2c3d', page: { width: 794, height: 1123 },
        contents: { rowHeightEm: 1.25 }, sections: [{ id: 'one', title: 'One' }] }
      await window.scorebook.prepareNumberedNotationFonts(['Book', 'One', 'Song', '目录', 'a1b2c3d'])
      const pages = window.scorebook.scorebookFrontPages(plan, [{ title: 'Song', section: 'one', slug: 'song', musicStart: 0, pageCount: 1 }])
      const body = pages[0].cloneNode(true)
      body.removeAttribute('data-score-export-footer')
      body.querySelectorAll('a').forEach(node => node.remove())
      pages.push(body)
      const blob = await window.scorebook.vectorScorePdf(pages, undefined, { fullPage: true })
      return [...new Uint8Array(await blob.arrayBuffer())]
    })
    await browser.close(); browser = undefined
    const file = join(temp, 'book.pdf')
    writeFileSync(file, Buffer.from(bytes))
    const texts = [1, 2, 3].map(page => execFileSync('pdftotext', ['-f', String(page), '-l', String(page), file, '-'], { encoding: 'utf8' }).replace(/\s/g, ''))
    assert.match(texts[0], /a1b2c3d/)
    assert.equal((texts[0].match(/https:\/\/score\.cheesefans\.com\//g) ?? []).length, 1)
    assert.doesNotMatch(texts[1], /https:\/\/score\.cheesefans\.com\//)
    assert.match(texts[2], /https:\/\/score\.cheesefans\.com\//)
    assert.match(readFileSync(file).subarray(0, 8).toString(), /%PDF/)
  } finally { await browser?.close(); rmSync(temp, { recursive: true, force: true }) }
})
