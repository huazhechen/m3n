import { chromiumLaunchOptions } from './lib/chromium-options.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

const root = resolve(import.meta.dirname, '..'), output = join(root, 'scorebook')
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const planFile=process.argv.find(arg=>arg.startsWith('--plan='))?.slice(7)??join(root,'config/scorebook/editorial-plan.json')
const plan = read(resolve(planFile)), record = read(join(output, plan.recordFile??'layout-record.json'))
const temp = join(root, '.tmp', plan.outputKey)
const pagesFile = join(temp, 'unoutlined-pages.json')
assert(existsSync(pagesFile), 'Run npm run build:scorebook first')
assert.equal(record.edition, plan.edition)
const rendererHash = createHash('sha256').update(readFileSync(join(temp, 'bundle/bundle.js'))).update(readFileSync(join(root, '.tmp/scorebook-font/text.ttf'))).digest('hex')
assert.equal(rendererHash, record.rendererSha256, 'The saved layouts must match the renderer')
for (const entry of record.entries) assert.equal(createHash('sha256').update(readFileSync(join(root,'src/scores',entry.file))).digest('hex'), entry.sourceSha256, `Rebuild after editing ${entry.file}`)
const pages = read(pagesFile)
assert.equal(pages.length, record.pageCount)
const folder = join(temp, 'compact'); mkdirSync(folder, {recursive:true})
await build({configFile:false,logLevel:'error',define:{'import.meta.url':JSON.stringify('http://scorebook.local/bundle.js')},build:{outDir:join(folder,'bundle'),emptyOutDir:true,minify:false,
  lib:{entry:join(root,'tools/scorebook-compact-layout.mjs'),name:'compactScorebook',formats:['iife'],fileName:()=>'bundle.js'}}})
const browser = await chromium.launch(chromiumLaunchOptions())
const filename = record.outputPdf ?? plan.outputPdf, staged = join(folder, filename)
const profile = record.page, results = []
const scoreUrls = new Map(record.entries.map(entry => [entry.id, `https://score.cheesefans.com/scores/${encodeURIComponent(entry.file.replace(/\.m3n$/, ''))}`]))
try {
  const page = await browser.newPage({viewport:{width:Math.ceil(profile.width+100),height:Math.ceil(profile.height+100)}})
  await page.route('**/*',route => route.fulfill({contentType:'text/html',body:'<!doctype html>'}))
  await page.goto('http://scorebook.local/')
  await page.setContent('<style>body{margin:0}</style><div id="scratch"></div>')
  await page.addScriptTag({path:join(folder,'bundle/bundle.js')})
  await page.evaluate(font=>window.compactScorebook.prepare(font),readFileSync(join(root,'.tmp/scorebook-font/text.ttf')).toString('base64'))
  for (const [i,p] of pages.entries()) {
    const urls = p.kind === 'music' ? (p.ids ?? [p.id]).map(id => {
      assert(scoreUrls.has(id), `Missing online score path: ${id}`)
      return scoreUrls.get(id)
    }) : []
    const result = await page.evaluate(({ markup, urls })=>window.compactScorebook.compactPage(markup, urls), { markup: p.svg, urls })
    assert.equal(result.outside.length, 0, `Page ${i+1}: outside paper`)
    results.push(result)
    if (i%20===0) console.log(`Shared glyphs ${i+1}/${pages.length}`)
  }
  const escape = value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;')
  const allLinks = results.flatMap(result => result.links)
  for (const url of scoreUrls.values()) assert(allLinks.some(link => link.url === url), `Missing title link: ${url}`)
  assert(allLinks.some(link => link.url === 'https://score.cheesefans.com/'), 'Missing cover link')
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(plan.title)} · ${escape(plan.edition)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:100%;height:100%}section>a{position:absolute;display:block}</style>${results.map(r=>`<section>${r.markup}${r.links.map(link=>`<a href="${link.url}" aria-label="${escape(link.label).replaceAll('"','&quot;')}" style="left:${link.x/profile.width*100}%;top:${link.y/profile.height*100}%;width:${link.width/profile.width*100}%;height:${link.height/profile.height*100}%"></a>`).join('')}</section>`).join('')}`
  writeFileSync(join(folder,'print.html'),html)
  await page.setContent(html,{timeout:120000})
  await page.evaluate(()=>document.fonts.ready)
  await page.pdf({path:staged,format:'A4',printBackground:true,preferCSSPageSize:true,timeout:120000})
} finally { await browser.close() }
const info = execFileSync('pdfinfo',[staged],{encoding:'utf8'})
const pdfUrls = execFileSync('pdfinfo',['-url',staged],{encoding:'utf8'})
for (const url of ['https://score.cheesefans.com/', ...scoreUrls.values()]) assert(pdfUrls.split('\n').some(line => line.trim().endsWith(` ${url}`)), `PDF annotation missing: ${url}`)
assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)[1]),record.pageCount)
const dimensions=info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m)
assert(Math.abs(Number(dimensions[1])-210/25.4*72)<1&&Math.abs(Number(dimensions[2])-297/25.4*72)<1,'PDF must use A4 paper')
const fonts = execFileSync('pdffonts',[staged],{encoding:'utf8'}).trim().split('\n').slice(2)
assert(fonts.length>0 && fonts.every(line=>/yes\s+yes\s+yes/.test(line)), 'Embed every used font with Unicode mappings')
assert(fonts.some(line=>line.includes('NotoSansCJKsc-Regular')))
assert(fonts.some(line=>line.includes('BarlowSemiCondensed-Medium')))
const images = execFileSync('pdfimages',['-list',staged],{encoding:'utf8'}).trim().split('\n').slice(2)
assert.equal(images.length,0,'Keep all score pages vector')
const compactBytes=statSync(staged).size
const report={edition:plan.edition,compactPdf:filename,pageCount:record.pageCount,compactBytes,embeddedFontSubsets:fonts.length,linkedScores:scoreUrls.size,linkAnnotations:results.reduce((sum,p)=>sum+p.links.length,0),images:0,positionedGlyphs:results.reduce((sum,p)=>sum+p.glyphs,0),glyphsPerPage:results.map(p=>p.glyphs),outsidePages:0,compactSha256:createHash('sha256').update(readFileSync(staged)).digest('hex')}
renameSync(staged,join(output,filename))
writeFileSync(join(output,plan.sizeReportFile??'PDF体积记录.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
