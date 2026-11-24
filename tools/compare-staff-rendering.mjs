import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {build} from 'vite'
import {chromium} from '@playwright/test'

const argument=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)
const reference=resolve(argument('reference-bundle')),baseline=JSON.parse(readFileSync(resolve(argument('baseline')),'utf8'))
assert(baseline.complete)
const root=resolve(import.meta.dirname,'..'),output=resolve(argument('output')??'.tmp/staff-render-parity/report.json'),bundle=resolve(dirname(output),'bundle')
mkdirSync(dirname(output),{recursive:true})
await build({configFile:false,logLevel:'error',base:'/',define:{'import.meta.url':JSON.stringify('http://staff-parity.local/bundle.js')},
 build:{outDir:bundle,emptyOutDir:true,minify:false,lib:{entry:resolve(root,'tools/staff-width-layout.mjs'),name:'staffWidths',formats:['iife'],fileName:()=>'bundle.js'}}})
const hash=value=>createHash('sha256').update(value).digest('hex')
const entries=[]
for(const entry of baseline.entries){
 const source=readFileSync(resolve(root,'src',entry.file),'utf8')
 assert.equal(hash(source),entry.sourceSha256,`Score changed: ${entry.file}`)
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium'].find(existsSync)})
 try{
  const results=[]
  for(const path of [reference,resolve(bundle,'bundle.js')]){
   const page=await browser.newPage()
   await page.route('http://staff-parity.local/**',route=>new URL(route.request().url()).pathname==='/'?
    route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html style="font-synthesis:none;text-rendering:optimizeLegibility"><body></body></html>'}):
    route.fulfill({path,contentType:'application/javascript; charset=utf-8'}))
   await page.goto('http://staff-parity.local/')
   await page.addScriptTag({url:'http://staff-parity.local/bundle.js'})
   results.push(await page.evaluate(({source,width})=>window.staffWidths.preview(source,width),{source,width:entry.width}))
   await page.close()
  }
  const referenceSha256=hash(JSON.stringify(results[0])),svgSha256=hash(JSON.stringify(results[1]))
  assert.equal(svgSha256,referenceSha256,`SVG changed: ${entry.file}`)
  entries.push({file:entry.file,width:entry.width,pages:results[1].length,identical:true,referenceSha256,svgSha256})
  writeFileSync(output,JSON.stringify({complete:false,entries},null,2)+'\n')
  console.log(`${entries.length}/${baseline.entries.length} ${entry.file}: identical`)
 }finally{await browser.close()}
}
writeFileSync(output,JSON.stringify({complete:true,entries},null,2)+'\n')
