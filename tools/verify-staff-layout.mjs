import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const filter=process.argv.find(a=>a.startsWith('--score='))?.slice(8)
const measureNumbers = process.argv.includes('--measure-numbers')
const screenshots = process.argv.includes('--screenshots')
const selected = file => !filter || filter.split(',').some(part => file.includes(part))
const root = resolve(import.meta.dirname, '..'),
  output = join(root, '.tmp/staff-layout-audit/verification-' + (filter??'all') + (measureNumbers ? '-numbers' : ''))
mkdirSync(output, { recursive: true })
execFileSync(process.execPath, [join(root, 'tools/build-staff-bundle.mjs'), `--output=${join(output, 'bundle')}`, '--origin=http://staff-audit.local'], { stdio: 'inherit' })

const inputs = ['scores', 'works']
  .flatMap((scope) =>
    readdirSync(join(root, 'src', scope))
      .filter((f) => f.endsWith('.m3n'))
      .map((file) => ({ file: `${scope}/${file}`, source: readFileSync(join(root, 'src', scope, file), 'utf8') })),
  )
  .filter((item) => selected(item.file))
const fixtures = [
  { file: 'fixture/tempo-caption', source: '{4/4}{120qpm}\nN: {expression=Largo}0^ (0 1) 2 | {60qpm}{expression=Meno}3 4 5 6 | 1 {90qpm}{expression=Allegro}2 3 4 |||' },
  { file: 'fixture/octave-tempo', source: '{4/4}{60qpm}\nN: {8va}{expression=Lento}1e 2e 3e 4e | {br}{72qpm}{expression=Meno}5e 6e 7e 1ee{/} |||' },
  { file: 'fixture/metronome-beats', source: '{4/4}{120qpm}\nN: 1 2 3 4 | {3/8}{96qpm}(1 2 3) | {6/8}{72qpm}(1 2 3 4 5 6) |||' },
  { file: 'fixture/tie-meter', source: '{key=B}{9/8}\nN: 0 0 0 (7d 7d 2~) | {6/8}(2) 1~ 1. |||' },
  { file: 'fixture/joined-repeat-meter', source: '{4/4}\nN: 1 2 3 4 :|| ||: {2/4}{144qpm}{expression=Allegro vivo}1 2 | 3 4 :||' },
  { file: 'fixture/split-repeat-meter', source: '{4/4}\nN: 1 2 3 4 :|| {br} ||: {2/4}{144qpm}{expression=Allegro vivo}1 2 | 3 4 :||' },
  { file: 'fixture/tuplet-groups', source: '{4/4}\nN: (([1 2 3:2]) ([4 5 6:2])) 1 2 3 | ([1 2 3 4 5:3]) 1 2 (3) | 1 2 3 ([0 0 3d:2]) |||' },
  { file: 'fixture/arpeggio-graces', source: '{4/4}\nN: [1# 3 5:h]{arp}{ac(6 7)} 2 3 4 |||' },
  { file: 'fixture/bass-slur', source: '{4/4}\nN: 1e 2e 3e 4e |||\nB: {lg}1d 2d 3d 4d{/} |' },
  { file: 'fixture/transposed-harmony', source: '{key=C}{4/4}\nN: 1 2 3 4 | 1 2 3 4 |||\nC: IV | G/B |', settings: { transpose: 5 } },
  { file: 'fixture/compound-quarter-beats', source: '{6/4}\nN: (1 2 3 4 5 6 7 1e 2e 3e 4e 5e) |||' },
  { file: 'fixture/inline-signatures', source: '{4/4}\nN: 1 2 {key=G} 3 4 | 5 6 7 1e |||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |' },
  { file: 'fixture/short-breaks', source: '{4/4}\n===A\nN: 1 2 3 4 | {br}5 6 7 1e |\n===B{br}\nN: 1 2 3 4 |||' },
  {
    file: 'fixture/equal-measures',
    source: '{equal-measures=true}{4/4}\nN: 1^^ | (1 2) (3 4) (5 6) (7 1e) | 1 2 3 4 |||',
  },
  {
    file: 'fixture/long-lyrics',
    source:
      '{title=长标题长标题长标题长标题长标题长标题长标题}{4/4}\nN: 1 2 3 4 | {br}5 6 7 1e |||\nL: Extraordinary extraordinarily extraordinary extraordinary | Spring summer autumn winter',
  },
  {
    file: 'fixture/bass-lyrics',
    source: '{4/4}\nN: ||: 1 2 3 4 | {br}5 6 7 1e :|||{x8}\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |\n' +
      Array.from({length: 8}, (_,i) => `L${i+1}: 春夏秋冬 | 山川天地`).join('\n'),
  },
  {
    file: 'fixture/long-section',
    source: `{title=长段名与顺序}{4/4}{order=${'很长的段落名称'.repeat(12)}}\n===${'很长的段落名称'.repeat(12)}\nN: 1 2 3 4 |||`,
  },
]
const entries = []
for (const input of [...fixtures.filter(item => selected(item.file)), ...inputs]) {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.route('http://staff-audit.local/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/')
        return route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html lang="zh-CN"><body></body></html>',
        })
      return route.fulfill({ path: join(output, 'bundle/bundle.js'), contentType: 'application/javascript; charset=utf-8' })
    })
    await page.goto('http://staff-audit.local/')
    await page.addScriptTag({ url: 'http://staff-audit.local/bundle.js' })
    const width = 640
    const result = await page.evaluate(
      async ({ source, width, measureNumbers, settings }) => {
        await window.staffWidths.prepare()
        return window.staffWidths.measure(source, width, true, { ...settings, measureNumbers })
      },
      { ...input, width, measureNumbers },
    )
    entries.push({ file: input.file, ...result })
    console.log(input.file, result.pageCount, result.outside.length, result.overlaps.length)
    if(result.outside.length||result.overlaps.length||screenshots||input.file.includes('ban_yin_jie_kou_qin_ji_ben_gong')){
      const svgs=await page.evaluate(({source,width,measureNumbers,settings})=>window.staffWidths.preview(source,width,{...settings,measureNumbers}),{...input,width,measureNumbers})
      const name=input.file.replaceAll('/','_')
      svgs.forEach((svg,i)=>writeFileSync(join(output,`${name}-${i+1}.svg`),svg))
      await page.screenshot({path:join(output,`${name}.png`),fullPage:true})
      if (input.file.includes('ban_yin_jie_kou_qin_ji_ben_gong')) {
        const order = await page.evaluate(() => {
          const instruction = [...document.querySelectorAll('g.dir')].find(node => node.textContent === '快速吹吸切换')
          const system = instruction?.closest('g.system')
          const heading = [...system?.querySelectorAll('g.reh') ?? []].find(node => node.textContent === '机能训练')
          const note = system?.querySelector('g.note')
          const tempo = system?.querySelector('g.tempo')
          if (!instruction || !heading || !note || !tempo || tempo.textContent.includes('快速吹吸切换')) return { ok: false, found: [!!instruction, !!heading, !!note, !!tempo] }
          const boxes = [tempo, heading, instruction, note].map(node => node.getBoundingClientRect())
          // Browser boxes include Bravura's full font ascent; use their centers
          // for order and the independent painted-ink audit for collisions.
          return { ok: boxes.slice(1).every((box, index) => boxes[index].top + boxes[index].bottom < box.top + box.bottom), boxes: boxes.map(box => ({ top: box.top, bottom: box.bottom })) }
        })
        if (!order.ok) throw new Error(`Practice instruction must stay between its section heading and first music, separate from tempo: ${JSON.stringify(order)}`)
      }
    }
  } catch (error) {
    entries.push({ file: input.file, error: String(error) })
    console.error(input.file, String(error))
  } finally {
    await browser.close()
  }
  writeFileSync(join(output, 'report.json'), JSON.stringify({ entries }, null, 2) + '\n')
}
if (entries.some((item) => item.error || item.outside.length || item.overlaps.length)) process.exitCode = 1
