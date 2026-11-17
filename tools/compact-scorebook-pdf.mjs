import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

const root = resolve(import.meta.dirname, '..'), output = join(root, 'scorebook')
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const planFile=process.argv.find(arg=>arg.startsWith('--plan='))?.slice(7)??join(output,'editorial-plan.json')
const plan = read(resolve(planFile)), record = read(join(output, plan.recordFile??'layout-record.json'))
const temp = join(root, '.tmp', plan.outputKey)
const pagesFile = join(temp, 'unoutlined-pages.json')
assert(existsSync(pagesFile), 'Run npm run build:scorebook first')
assert.equal(record.edition, plan.edition)
const rendererHash = createHash('sha256').update(readFileSync(join(temp, 'bundle/bundle.js'))).update(readFileSync(join(root, 'public/fonts/NotoSerifCJKsc-Regular.otf'))).digest('hex')
assert.equal(rendererHash, record.rendererSha256, 'The saved layouts must match the renderer')
for (const entry of record.entries) assert.equal(createHash('sha256').update(readFileSync(join(root,'src/scores',entry.file))).digest('hex'), entry.sourceSha256, `Rebuild after editing ${entry.file}`)
const pages = read(pagesFile)
assert.equal(pages.length, record.pageCount)
const folder = join(temp, 'compact'); mkdirSync(folder, {recursive:true})
await build({configFile:false,logLevel:'error',build:{outDir:join(folder,'bundle'),emptyOutDir:true,minify:false,
  lib:{entry:join(root,'tools/scorebook-compact-layout.mjs'),name:'compactScorebook',formats:['iife'],fileName:()=>'bundle.js'}}})
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || ['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
const filename = plan.outputPdf, staged = join(folder, filename)
const profile = record.page, results = []
try {
  const page = await browser.newPage({viewport:{width:Math.ceil(profile.width+100),height:Math.ceil(profile.height+100)}})
  await page.route('**/*',route => route.request().url().endsWith('/fonts/NotoSerifCJKsc-Regular.otf')
    ? route.fulfill({path:join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'),contentType:'font/otf'})
    : route.fulfill({contentType:'text/html',body:'<!doctype html>'}))
  await page.goto('http://scorebook.local/')
  await page.setContent('<style>body{margin:0}</style><div id="scratch"></div>')
  await page.addScriptTag({path:join(folder,'bundle/bundle.js')})
  await page.evaluate(font=>window.compactScorebook.prepare(font),readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
  for (const [i,p] of pages.entries()) {
    const result = await page.evaluate(markup=>window.compactScorebook.compactPage(markup), p.svg)
    assert.equal(result.outside.length, 0, `Page ${i+1}: outside paper`)
    results.push(result)
    if (i%20===0) console.log(`Shared glyphs ${i+1}/${pages.length}`)
  }
  const escape = value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;')
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(plan.title)} · ${escape(plan.edition)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:100%;height:100%}</style>${results.map(r=>`<section>${r.markup}</section>`).join('')}`
  writeFileSync(join(folder,'print.html'),html)
  await page.setContent(html,{timeout:120000})
  await page.evaluate(()=>document.fonts.ready)
  await page.pdf({path:staged,format:'A4',printBackground:true,preferCSSPageSize:true,timeout:120000})
} finally { await browser.close() }
const info = execFileSync('pdfinfo',[staged],{encoding:'utf8'})
assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)[1]),record.pageCount)
const dimensions=info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m)
assert(Math.abs(Number(dimensions[1])-210/25.4*72)<1&&Math.abs(Number(dimensions[2])-297/25.4*72)<1,'PDF must use A4 paper')
const fonts = execFileSync('pdffonts',[staged],{encoding:'utf8'}).trim().split('\n').slice(2)
assert(fonts.length>0 && fonts.every(line=>/yes\s+yes\s+yes/.test(line)), 'Embed every used font with Unicode mappings')
assert(fonts.some(line=>line.includes('NotoSerifCJKsc-Regular')))
assert(fonts.some(line=>line.includes('BarlowSemiCondensed-Medium')))
const images = execFileSync('pdfimages',['-list',staged],{encoding:'utf8'}).trim().split('\n').slice(2)
assert.equal(images.length,0,'Keep all score pages vector')
const compactBytes=statSync(staged).size
const report={edition:plan.edition,compactPdf:filename,pageCount:record.pageCount,compactBytes,embeddedFontSubsets:fonts.length,images:0,positionedGlyphs:results.reduce((sum,p)=>sum+p.glyphs,0),glyphsPerPage:results.map(p=>p.glyphs),outsidePages:0,compactSha256:createHash('sha256').update(readFileSync(staged)).digest('hex')}
renameSync(staged,join(output,filename))
writeFileSync(join(output,plan.sizeReportFile??'PDF体积记录.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
