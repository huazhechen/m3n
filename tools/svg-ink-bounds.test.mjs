import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {before,after,test} from 'node:test'
import {chromium} from '@playwright/test'
let browser,page
before(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true})
  page=await browser.newPage()
  await page.setContent('<svg width="300" height="300" viewBox="0 0 300 300"></svg>')
  await page.addScriptTag({content:readFileSync(new URL('./lib/svg-ink-bounds.mjs',import.meta.url),'utf8').replace('export function','function')})
})
after(async()=>{await browser?.close()})

test('uses painted ascenders/descenders and respects each anchor and group transform',async()=>{
  const results=await page.evaluate(()=>{
    const svg=document.querySelector('svg'),ctx=document.createElement('canvas').getContext('2d')
    ctx.font='normal 400 40px serif';ctx.textAlign='left';ctx.textBaseline='alphabetic'
    return ['start','middle','end'].map(anchor=>{
      svg.innerHTML=`<g transform="translate(10 20) scale(1.5)"><text x="70" y="80" font-family="serif" font-size="40" text-anchor="${anchor}">Ag</text></g>`
      const m=ctx.measureText('Ag'),text=svg.querySelector('text'),bounds=createSvgInkMeasurer()
      const shift=anchor==='middle'?m.width/2:anchor==='end'?m.width:0
      return {actual:bounds(text),group:bounds(svg.querySelector('g')),expected:{x:10+1.5*(70-shift-m.actualBoundingBoxLeft),y:20+1.5*(80-m.actualBoundingBoxAscent),width:1.5*(m.actualBoundingBoxLeft+m.actualBoundingBoxRight),height:1.5*(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)}}
    })
  })
  for(const {actual,group,expected}of results)for(const key of Object.keys(expected)){
    assert.ok(Math.abs(actual[key]-expected[key])<1e-6,`${key} must use actual painted metrics`)
    assert.equal(group[key],actual[key])
  }
})
test('rejects font-box-only overlaps and still detects actual text collisions',async()=>{
  const r=await page.evaluate(()=>{
    const svg=document.querySelector('svg'),ctx=document.createElement('canvas').getContext('2d')
    ctx.font='40px serif';const m=ctx.measureText('A'),height=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent
    svg.innerHTML=`<text x="20" y="60" font-family="serif" font-size="40">A</text><text x="20" y="${60+height+1}" font-family="serif" font-size="40">A</text><text x="20" y="${60+height-2}" font-family="serif" font-size="40">A</text>`
    const [a,b,c]=[...svg.querySelectorAll('text')],bounds=createSvgInkMeasurer()
    return {fontBoxesOverlap:a.getBBox().y+a.getBBox().height>b.getBBox().y,clear:bounds(a).y+bounds(a).height<bounds(b).y,collision:bounds(a).y+bounds(a).height-bounds(c).y}
  })
  assert.equal(r.fontBoxesOverlap,true)
  assert.equal(r.clear,true)
  assert.equal(r.collision,2)
})
test('includes stroked lines, ignores unpainted spaces, and measures rotated groups in SVG coordinates',async()=>{
  const r=await page.evaluate(()=>{
    const svg=document.querySelector('svg')
    svg.innerHTML='<g transform="translate(100 100) rotate(90)"><line x1="0" y1="0" x2="20" y2="0" stroke="black" stroke-width="2"/><text x="1000" y="1000"> </text></g>'
    return createSvgInkMeasurer()(svg.querySelector('g'))
  })
  for(const[key,expected]of Object.entries({x:99,y:99,width:2,height:22}))assert.ok(Math.abs(r[key]-expected)<1e-6)
})
