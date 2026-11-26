import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {chromium} from '@playwright/test'
const root=resolve(import.meta.dirname,'..')
const argument=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)
const baselinePath=resolve(argument('baseline')??'.tmp/font8-full/current.json')
const base=JSON.parse(readFileSync(baselinePath,'utf8'))
assert(base.complete,'Expected a complete baseline with selected widths')
const output=resolve(argument('output')??'.tmp/row-envelope/current.json'),out=dirname(output)
const sourceRoot=resolve(argument('source-root')??base.sourceRoot)
mkdirSync(out,{recursive:true})
const bundle=join(out,'diagnostic-bundle');mkdirSync(bundle,{recursive:true})
writeFileSync(join(bundle,'entry.ts'),`export * from ${JSON.stringify(join(root,'tools/numbered-row-envelope-layout.mjs'))};\n`)
execFileSync(process.execPath,[join(root,'tools/build-numbered-audit-bundle.mjs'),bundle],{stdio:'inherit'})
const fonts=JSON.parse(readFileSync(root+'/tools/fonts/library/manifest.json','utf8')).fonts,origin='http://row-envelope.local'
assert.deepEqual(fonts.map(({file,sha256})=>({file,sha256})),base.fontHashes,'Different font input')
const report={complete:false,baseline:baselinePath,fontHashes:base.fontHashes,sourceRevision:base.sourceRevision,
 rendererHash:createHash('sha256').update(readFileSync(join(bundle,'bundle/bundle.js'))).digest('hex'),
 auditLayout:false,widthSearch:false,method:'fixed baseline widths, both 8/16 tiers, exact engraved row envelopes',entries:[]},started=performance.now()

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-gpu','--renderer-process-limit=1','--disable-features=SpareRendererForSitePerProcess','--js-flags=--expose-gc --max-old-space-size=256']})
try{
 const page=await browser.newPage()
 await page.route(origin+'/**',route=>{const path=new URL(route.request().url()).pathname;return path==='/'?route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html style="font-synthesis:none"><body></body></html>'}):path.startsWith('/fonts/')?route.fulfill({path:root+'/tools/fonts/library/'+path.split('/').at(-1),contentType:'font/ttf'}):route.fulfill({path:join(bundle,'bundle/bundle.js'),contentType:'application/javascript'})})
 await page.goto(origin);await page.addScriptTag({url:origin+'/bundle.js'});await page.evaluate(fonts=>m3n.initialize(fonts),fonts.map(f=>({...f,url:origin+'/fonts/'+f.file})))
 for(const entry of base.entries){
  const source=readFileSync(sourceRoot+'/'+entry.file,'utf8'),sourceHash=createHash('sha256').update(source).digest('hex')
  if(sourceHash!==entry.sourceHash)throw new Error('Source mismatch')
  const result=await page.evaluate(({source,width})=>m3n.measureBoth(source,width),{source,width:entry.width})
  if(result.pages!==entry.pages||result.rows!==entry.rows||result.exactMinPages!==entry.pages)throw new Error('Baseline geometry changed: '+entry.file)
  report.entries.push({file:entry.file,sourceHash,...result});writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  console.log(`${report.entries.length}/${base.entries.length} ${entry.file}: ${result.pages} -> ${result.boxOnlyPages}/${result.measureMaxPages}/${result.literalGapPages}; height ${(result.naturalBoxHeight/result.naturalHeight).toFixed(3)}`)
  await page.evaluate(()=>{if(typeof globalThis.gc==='function')globalThis.gc()})
 }
}finally{await browser.close()}
report.complete=true;report.batchMs=performance.now()-started;writeFileSync(output,JSON.stringify(report,null,2)+'\n')
