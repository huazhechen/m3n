import {build} from 'vite'
import {chromium} from '@playwright/test'
import {resolve, basename} from 'node:path'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
const root=resolve(import.meta.dirname,'..')
const file=process.argv.find(arg=>arg.startsWith('--score='))?.slice(8)??'guo_huo_01.m3n'
const scorePath=resolve(root,'src/scores',file)
const folder=resolve(root,'.tmp/width-stability',basename(file,'.m3n'))
mkdirSync(folder,{recursive:true})
await build({configFile:false,logLevel:'error',define:{'import.meta.url':JSON.stringify('http://local/bundle.js')},build:{outDir:folder+'/bundle',lib:{entry:resolve(root,'tools/score-width-stability.mjs'),name:'probeFonts',formats:['iife'],fileName:()=> 'bundle.js'}}})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
try{
const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({body:'<!doctype html><html lang="zh-CN"><body><div id="scratch"></div></body></html>',contentType:'text/html'}));await page.goto('http://local');await page.addScriptTag({path:folder+'/bundle/bundle.js'});await page.evaluate(()=>window.probeFonts.prepareNumberedNotationFonts());
const source=readFileSync(scorePath,'utf8'),results=[]
// This cache belongs to one source and one set of display settings per run.
const cache=new Map(),widthOffsets=[-5,0,5]
let probeRequests=0,cacheHits=0
async function cachedProbe(width){
 probeRequests++
 if(cache.has(width)){cacheHits++;return cache.get(width)}
 const result=await page.evaluate(({source,width})=>window.probeFonts.probe(source,width),{source,width})
 cache.set(width,result)
 return result
}
for(let width=640;width<=800;width+=10){
 const cases=[]
 for(const offset of widthOffsets)cases.push(await cachedProbe(width+offset))
 assert.ok(cases.every(c=>c.identical),`Every trial must match the normal web renderer near ${width}px`)
 const stable=cases.every(c=>c.identical&&!c.outside.length&&!c.overlaps.length&&c.pageCount===cases[1].pageCount)
 results.push({width,stable,cases})
 console.log(JSON.stringify({width,stable,cases:cases.map(c=>({width:c.width,pages:c.pageCount,rows:c.systemsPerPage,outside:c.outside.length,overlaps:c.overlaps.length,identical:c.identical}))}))
}
const best=results.filter(r=>r.stable).sort((a,b)=>a.cases[1].pageCount-b.cases[1].pageCount||a.width-b.width)[0]
const renderCache={requests:probeRequests,uniqueWidths:cache.size,hits:cacheHits}
writeFileSync(folder+'/report.json',JSON.stringify({score:file,baseFontSize:22,widthOffsets,renderCache,criterion:'pageCount',sharedPageCheck:'not-applicable: single-score trial',bestWidth:best?.width,results:results.map(r=>({...r,cases:r.cases.map(({markup:_markup,...c})=>c)}))},null,2))
for(const r of results.filter(r=>r.width===650||r.width===best?.width))for(const c of r.cases)for(const [i,svg]of c.markup.entries())writeFileSync(`${folder}/${r.width}-${c.width}-${i+1}.svg`,svg)
const selected=results.filter(r=>r.width===650||r.width===best?.width)
const gallery='<!doctype html><meta charset="utf-8"><title>宽度稳定性试排</title><style>body{background:#ddd}figure{display:inline-block;vertical-align:top;width:380px;margin:12px}figure img{width:100%;background:white}</style>'+selected.flatMap(r=>r.cases.flatMap(c=>c.markup.map((_,i)=>`<figure><figcaption>候选${r.width}px · 实际${c.width}px · 第${i+1}页</figcaption><img src="${r.width}-${c.width}-${i+1}.svg"></figure>`))).join('')
writeFileSync(folder+'/index.html',gallery)
if(best){
 await page.setContent('<!doctype html><html lang="zh-CN"><style>@page{size:A4;margin:0}html,body{margin:0}section{box-sizing:border-box;width:210mm;height:297mm;padding:12mm;break-after:page}section:last-child{break-after:auto}section>svg{display:block;width:100%;height:100%;object-fit:contain;object-position:center top}</style>'+best.cases[1].markup.map(markup=>'<section>'+markup+'</section>').join(''))
 await page.evaluate(()=>document.fonts.ready)
 await page.pdf({path:folder+'/trial.pdf',format:'A4',printBackground:true,preferCSSPageSize:true})
}
console.log(JSON.stringify({bestWidth:best?.width,renderCache,report:folder+'/report.json',preview:folder+'/index.html',pdf:best?folder+'/trial.pdf':undefined}))
}finally{await browser.close()}
