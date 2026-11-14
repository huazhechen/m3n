import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { chromium } from '@playwright/test'

test('mixed export preserves staff glyphs, above-staff hairpins, crops and numbered lyrics', async () => {
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
    const result = await page.evaluate(async () => {
      const source = '{title=五线谱验证}{key=D}{96qpm}{4/4}\nN: ' + Array(30).fill('{lg}{cresc}1{p}{tr} 2# 3 4{/}{/} | {br}').join(' ') + '1^^ |||'
      const layout = await window.scorebook.measure(source,680,{notation:'staff',showCredits:false,systemGap:18})
      const host = document.querySelector('#scratch')
      host.innerHTML=layout.markup
      const svg=host.firstElementChild, systems=[...svg.querySelectorAll('g.system')]
      const systemIndex=systems.length-2
      const noteCount=systems[systemIndex].querySelectorAll('g.note').length
      const secondHairpin=systems[systemIndex].querySelector('g.hairpin').getBoundingClientRect()
      const secondStaff=systems[systemIndex].querySelector('g.staff > path').getBoundingClientRect()
      const crop=layout.markup.replace(/<svg[^>]*>/,tag=>tag.replace(/\s(?:x|y|width|height|viewBox|overflow)="[^"]*"/g,'').replace(/>$/,` width="680" height="${layout.cuts[systemIndex+1]-layout.cuts[systemIndex]}" viewBox="0 ${layout.cuts[systemIndex]} 680 ${layout.cuts[systemIndex+1]-layout.cuts[systemIndex]}" overflow="hidden">`))
      const paper=`<svg xmlns="http://www.w3.org/2000/svg" width="680" height="1000" viewBox="0 0 680 1000">${crop}</svg>`
      document.querySelector('#print-page').innerHTML=paper
      await window.scorebook.outlinePage()
      const outlined=document.querySelector('#print-page')
      const staffStroke=getComputedStyle(outlined.querySelector('g.staff > path')).stroke
      const outlineNotes=outlined.querySelectorAll('g.note').length
      const outlinePaths=outlined.querySelectorAll('g.note path').length
      const compact=window.scorebook.compactPage(paper)
      return {staffHeight:layout.staffHeight,staffStroke,tempoPaths:svg.querySelectorAll('g.tempo [data-scorebook-smufl] path').length,compactOutside:compact.outside,overlaps:layout.overlaps,rows:layout.rows,outside:layout.outside,clipped:layout.clipped,hasUses:layout.markup.includes('<use'),noteCount,outlineNotes,outlinePaths,compactNotes:host.querySelectorAll('g.note').length,compactPaths:host.querySelectorAll('g.note path').length,hairpinBottom:secondHairpin.bottom,staffTop:secondStaff.top}
    })
    assert(result.rows>=3)
    assert(result.staffHeight>=26 && result.staffHeight<=29, 'staff height must preserve the single-page Second Waltz calibrated scale')
    assert(result.tempoPaths>0)
    assert.notEqual(result.staffStroke,'none')
    assert.deepEqual(result.outside,[])
    assert.deepEqual(result.clipped,[])
    assert.deepEqual(result.overlaps,[])
    assert.deepEqual(result.compactOutside,[])
    assert.equal(result.hasUses,false)
    assert.equal(result.outlineNotes,result.noteCount)
    assert.equal(result.compactNotes,result.noteCount)
    assert(result.outlinePaths>0 && result.compactPaths>0)
    assert(result.hairpinBottom<result.staffTop)
    const waltz = await page.evaluate(async source => {
      const layout=await window.scorebook.measure(source,765,{notation:'staff',showCredits:false,systemGap:18})
      return {height:layout.height*696/765,rows:layout.rows,outside:layout.outside,overlaps:layout.overlaps,clipped:layout.clipped}
    },readFileSync(join(root,'src/scores/second_waltz_01.m3n'),'utf8'))
    assert(waltz.height<=1057, 'the complete Second Waltz must fit on one music page at the normal system gap')
    assert.equal(waltz.rows,10)
    assert.deepEqual(waltz.outside,[])
    assert.deepEqual(waltz.overlaps,[])
    assert.deepEqual(waltz.clipped,[])
    const numbered = await page.evaluate(async source => {
      const layout=await window.scorebook.measure(source,606,{notation:'numbered',showCredits:false,uniformSystemHeight:true,pageMargin:8,systemGap:18,noteGapEm:.6,minimumNoteGapEm:.4})
      return {outside:layout.outside,overlaps:layout.overlaps,clipped:layout.clipped}
    },readFileSync(join(root,'src/scores/hong_mei_hua_er_kai_01.m3n'),'utf8'))
    assert.deepEqual(numbered,{outside:[],overlaps:[],clipped:[]})
    const engraving = await page.evaluate(async () => {
      const source='{key=D}{4/4}\nN: 1 (2 3) 4 5 | 6^ 5^ |||'
      const original=await window.scorebook.measure(source,696,{notation:'staff',staffScale:38})
      const originalStroke=parseFloat(getComputedStyle(document.querySelector('#scratch g.staff > path')).strokeWidth)
      const originalIds=[...document.querySelectorAll('#scratch g.note')].map(note=>note.id)
      const adjusted=await window.scorebook.measure(source,696,{notation:'staff',staffScale:48,staffLineColor:'#666666',staffEngraving:{staffLineWidth:.1,stemWidth:.16,barLineWidth:.22,slurMidpointThickness:.35,tieMidpointThickness:.3,spacingLinear:.18,spacingNonLinear:.55,spacingSystem:3}})
      const line=document.querySelector('#scratch g.staff > path')
      return {originalStroke,adjustedStroke:parseFloat(getComputedStyle(line).strokeWidth),color:getComputedStyle(line).stroke,originalIds,adjustedIds:[...document.querySelectorAll('#scratch g.note')].map(note=>note.id),heightRatio:adjusted.staffHeight/original.staffHeight,outside:adjusted.outside,overlaps:adjusted.overlaps,clipped:adjusted.clipped}
    })
    assert(engraving.adjustedStroke<engraving.originalStroke)
    assert.equal(engraving.color,'rgb(102, 102, 102)')
    assert.deepEqual(engraving.originalIds,engraving.adjustedIds)
    assert(engraving.heightRatio>1.2)
    assert.deepEqual(engraving.outside,[])
    assert.deepEqual(engraving.overlaps,[])
    assert.deepEqual(engraving.clipped,[])
    const lyrics = await page.evaluate(async source => {
      const layout=await window.scorebook.measure(source,696,{notation:'staff',staffScale:40,showCredits:false})
      return {outside:layout.outside,overlaps:layout.overlaps,clipped:layout.clipped}
    },readFileSync(join(root,'src/scores/hong_mei_hua_er_kai_01.m3n'),'utf8'))
    assert.deepEqual(lyrics,{outside:[],overlaps:[],clipped:[]})
  } finally { await browser?.close(); rmSync(temp,{recursive:true,force:true}) }
})
