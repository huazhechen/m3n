import { build } from 'vite'
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..'), out = resolve(root, '.tmp/page-gap-audit')
mkdirSync(out, { recursive: true })
const entry = resolve(out, 'entry.ts')
writeFileSync(entry, `
export { parseM3NDocument, A4_CONTENT_ASPECT_RATIO } from '${root}/packages/notation/src/index.ts';
export { prepareNumberedNotationFonts } from '${root}/packages/numbered-notation/src/index.ts';
export { layoutNativeScore } from '${root}/packages/numbered-notation/src/native-layout.ts';
export { nativeCoreGap } from '${root}/packages/numbered-notation/src/native-style.ts';
export { paginateScoreBlocks } from '${root}/packages/numbered-notation/src/layout/pagination.ts';
`)
await build({ configFile: false, logLevel: 'error', resolve: { alias: {
  '@m3n/notation': resolve(root, 'packages/notation/src/index.ts'),
} }, build: { outDir: resolve(out, 'bundle'), lib: { entry, name: 'gapAudit', formats: ['iife'], fileName: () => 'bundle.js' } } })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setContent('<main></main>')
  await page.addScriptTag({ path: resolve(out, 'bundle/bundle.js') })
  await page.evaluate(async () => { await gapAudit.prepareNumberedNotationFonts(); await document.fonts.ready })
  const reports = []
  for (const file of readdirSync(resolve(root, 'src/scores')).filter(f => f.endsWith('.m3n'))) {
    const source = readFileSync(resolve(root, 'src/scores', file), 'utf8')
    const result = await page.evaluate(({ source }) => {
      const doc = gapAudit.parseM3NDocument(source), width = 720
      const layout = gapAudit.layoutNativeScore(doc, { width, paged: true, pageMargin: 0 })
      const settings = { pageHeight: Math.floor(width * gapAudit.A4_CONTENT_ASPECT_RATIO), margin: 0, maxGap: gapAudit.nativeCoreGap(doc) * 1.1, headerGap: gapAudit.nativeCoreGap(doc) * .8, elastic: true }
      const trial = gap => {
        const pagination = gapAudit.paginateScoreBlocks(layout.verticalBlocks, { ...settings, gap, maxGap: Math.max(settings.maxGap, gap) })
        return { pages: pagination.heights.length, coreGaps: pagination.coreGaps,
          rowsPerPage: pagination.heights.map((_, index) => pagination.positions.slice(layout.headerBlocks.length).filter(p => p.page === index).length) }
      }
      const before = trial(16), after = trial(24)
      const current = trial(gapAudit.nativeCoreGap(doc))
      if (current.pages !== layout.pages.length || JSON.stringify(current.coreGaps) !== JSON.stringify(layout.pages.map(p => p.coreGap))) throw new Error('Source spacing trial differs from current renderer')
      if (after.pages !== before.pages || doc.title.includes('Valsentino')) {
        // A fixed 24px render has identical page membership to a 24–32px
        // fit: the fit stretches only after the minimum has assigned pages.
        const direct = gapAudit.layoutNativeScore(doc, { width, paged: true, pageMargin: 0, coreGap: 24 })
        if (direct.pages.length !== after.pages) throw new Error('Trial differs from direct 24px rendering')
      }
      return { title: doc.title, width, systems: layout.systems.length, before, after, addedPages: after.pages - before.pages }
    }, { source })
    reports.push({ file, sourceSha256: createHash('sha256').update(source).digest('hex'), ...result })
    console.log(`${file}: ${result.width}px ${result.before.pages} -> ${result.after.pages}`)
  }
  const summary = { sources: reports.length, affected: reports.filter(r => r.addedPages > 0).length,
    beforePages: reports.reduce((n, r) => n + r.before.pages, 0), afterPages: reports.reduce((n, r) => n + r.after.pages, 0) }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ date: new Date().toISOString(), minimums: [16, 24], maximum: 32, pageMargin: 0, summary, reports }, null, 2))
  console.log(JSON.stringify(summary))
} finally { await browser.close() }
