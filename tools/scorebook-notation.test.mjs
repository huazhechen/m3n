import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { chromium } from '@playwright/test'

test('numbered export preserves alternative notes, lyrics and outlines at narrow and print widths', async () => {
  const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'm3n-scorebook-'))
  let browser
  try {
    const entry = join(temp, 'entry.mjs')
    writeFileSync(entry, `export * from ${JSON.stringify(join(root,'tools/scorebook-layout.mjs'))}; export {compactPage} from ${JSON.stringify(join(root,'tools/scorebook-compact-layout.mjs'))}`)
    await build({configFile:false,logLevel:'error',define:{'import.meta.url':JSON.stringify('http://scorebook.local/bundle.js')},build:{outDir:join(temp,'bundle'),lib:{entry,name:'scorebook',formats:['iife'],fileName:()=> 'bundle.js'}}})
    browser = await chromium.launch({executablePath:['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
    const page = await browser.newPage()
    await page.route('**/*', route => {
      const path = new URL(route.request().url()).pathname
      if(path==='/bundle.js')return route.fulfill({path:join(temp,'bundle/bundle.js'),contentType:'application/javascript; charset=utf-8'})
      if(path.endsWith('.otf'))return route.fulfill({path:join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'),contentType:'font/otf'})
      return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="scratch"></div><div id="print-page"></div>'})
    })
    await page.goto('http://scorebook.local/')
    await page.addScriptTag({url:'http://scorebook.local/bundle.js'})
    await page.evaluate(font=>window.scorebook.prepare(font),readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
    for (const width of [320,696]) {
      const result=await page.evaluate(async width=>{
        const layout=await window.scorebook.measure('{title=替代旋律}{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 甲乙 | 丙丁\nL2: 戊己 | 庚辛壬\nNs[2]: 2: (5 6) 7 |',width,{showCredits:false})
        document.querySelector('#print-page').innerHTML=layout.markup
        const svg=document.querySelector('#print-page svg')
        const rects=[...svg.querySelectorAll('g.note text')].map(node=>{const b=node.getBoundingClientRect();return {text:node.textContent,y:b.y,bottom:b.bottom,size:node.getAttribute('font-size'),alternative:node.closest('g.note').getAttribute('data-m3n-id')?.startsWith('m3n-e-a')}})
        await window.scorebook.outlinePage()
        return {outside:layout.outside,clipped:layout.clipped,overlaps:layout.overlaps,rects,alternatives:svg.querySelectorAll('[data-m3n-id^="m3n-e-a"]').length,text:svg.querySelectorAll('text').length,paths:svg.querySelectorAll('path[d]').length,outlined:svg.querySelectorAll('[data-outlined-text]').length}
      },width)
      assert.deepEqual(result.outside,[])
      assert.deepEqual(result.clipped,[])
      assert.deepEqual(result.overlaps,[])
      assert(result.alternatives>=3)
      assert.equal(result.text,0)
      assert(result.paths>0 && result.outlined>0)
      assert(result.rects.filter(note=>note.alternative).length>=3)
      assert(result.rects.filter(note=>note.alternative).every(note=>note.size==='22'))
    }
    for (const width of [320,696]) {
      const boundaries=await page.evaluate(async width=>{
        const source='{2/4}{order=A,B,A}\n===A{br}\nN: ||: 1 2 | 3 4 | 5 6 | 7 1e |\n---V1\nN: 2e 3e :||\n---V2\nN: 4e 5e ||\n===B{br}\nN: ||: 6 7 | 1e 2e :||'
        const layout=await window.scorebook.measure(source,width,{showCredits:false})
        return {ranges:layout.repeatRanges,rows:layout.rows,outside:layout.outside,clipped:layout.clipped}
      },width)
      assert.deepEqual(boundaries.outside,[])
      assert.deepEqual(boundaries.clipped,[])
      assert.deepEqual(boundaries.ranges.map(({section,occurrence})=>({section,occurrence})),[{section:'A',occurrence:1},{section:'B',occurrence:1}])
      assert(boundaries.ranges[0].end<=boundaries.ranges[1].start)
      assert(boundaries.ranges[1].end<=boundaries.rows)
    }
  } finally { await browser?.close(); rmSync(temp,{recursive:true,force:true}) }
})
