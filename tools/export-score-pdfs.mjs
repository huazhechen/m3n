import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..'), output = join(root, 'scorebook')
const plan = JSON.parse(readFileSync(join(output, 'editorial-plan.json'), 'utf8'))
const record = JSON.parse(readFileSync(join(output, 'layout-record.json'), 'utf8'))
const temp = join(root, '.tmp', plan.outputKey), staged = join(temp, 'single-pdfs')
const hash = value => createHash('sha256').update(value).digest('hex')
assert.equal(plan.edition, record.edition)
assert.equal(record.entries.length, plan.entries.length)
assert.equal(createHash('sha256').update(readFileSync(join(temp, 'bundle/bundle.js'))).update(readFileSync(join(root, 'tools/fonts/NotoSerifCJKsc-Regular.otf'))).digest('hex'), record.rendererSha256)
const sources = new Map(record.entries.map(entry => {
  const source = readFileSync(join(root, 'src/scores', entry.file), 'utf8')
  assert.equal(hash(source), entry.sourceSha256, `Rebuild after editing ${entry.file}`)
  return [entry.file, source]
}))
mkdirSync(staged, { recursive: true })
const profile = record.page, results = [], selected = [], aliases = []
const six = ['moon_river', 'autumn_leaves', 'what_a_wonderful_world', 'over_the_rainbow', 'fly_me_to_the_moon', 'cai_yun_zhui_yue']
const style = '<style>@page{size:A4;margin:0}html,body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:100%;height:100%}section>a{display:block;position:absolute}</style>'
const section = page => '<section>' + page.markup + page.links.map(link => `<a href="${link.url}" style="left:${link.x / profile.width * 100}%;top:${link.y / profile.height * 100}%;width:${link.width / profile.width * 100}%;height:${link.height / profile.height * 100}%"></a>`).join('') + '</section>'
function validate(file, pages, urls) {
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)[1]), pages)
  const dimensions = info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m)
  assert(Math.abs(Number(dimensions[1]) - 595.276) < 1 && Math.abs(Number(dimensions[2]) - 841.89) < 1)
  const fonts = execFileSync('pdffonts', [file], { encoding: 'utf8' }).trim().split('\n').slice(2)
  assert(fonts.length && fonts.every(line => /yes\s+yes\s+yes/.test(line)), 'Every font needs embedding and Unicode mappings')
  assert.equal(execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).trim().split('\n').slice(2).length, 0)
  const links = execFileSync('pdfinfo', ['-url', file], { encoding: 'utf8' }).split('\n')
  for (const url of urls) assert(links.some(line => line.trim().endsWith(` ${url}`)), `Missing title link: ${url}`)
  return { bytes: statSync(file).size, sha256: hash(readFileSync(file)) }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser'].find(existsSync), headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="scratch"></div>' }))
  await page.goto('http://scorebook.local/')
  await page.addScriptTag({ path: join(temp, 'bundle/bundle.js') })
  await page.addScriptTag({ path: join(temp, 'compact/bundle/bundle.js') })
  await page.evaluate(async font => { await window.scorebook.prepare(font); await window.compactScorebook.prepare(font) }, readFileSync(join(root, 'tools/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
  for (const [index, entry] of plan.entries.entries()) {
    const source = sources.get(entry.file), actual = record.entries.find(item => item.file === entry.file)
    const width = actual.width, url = `https://score.cheesefans.com/scores/${entry.file.replace(/\.m3n$/, '')}`
    await page.setContent('<div id="scratch"></div>')
    const rendered = await page.evaluate(async ({ source, width, profile, url }) => {
      const measured = await window.scorebook.measure(source, width)
      if (measured.outside.length || measured.overlaps.length) throw new Error('Unsafe solo layout')
      const pages = await window.scorebook.a4Pages(source, width)
      return pages.map(item => window.compactScorebook.compactPage(`<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 ${profile.width} ${profile.height}"><rect width="100%" height="100%" fill="white"/>${item.markup}</svg>`, [url]))
    }, { source, width, profile, url })
    assert(rendered.every(item => !item.outside.length))
    const sections = rendered.map(section).join(''), filename = entry.file.replace(/\.m3n$/, '.pdf')
    await page.setContent(style + sections); await page.evaluate(() => document.fonts.ready)
    await page.pdf({ path: join(staged, filename), printBackground: true, preferCSSPageSize: true, timeout: 120000 })
    results.push({ id: entry.id, title: entry.title, file: filename, width, pages: rendered.length, ...validate(join(staged, filename), rendered.length, [url]) })
    if (six.includes(entry.id)) selected.push({ id: entry.id, sections, pages: rendered.length, url })
    const alias = entry.id === 'ai_de_li_zan' ? '爱的礼赞-校验稿.pdf' : entry.id === 'meng_huan_qu' ? '梦幻曲-校验稿.pdf' : entry.id === 'ban_yin_jie_kou_qin_ji_ben_gong' ? '半音阶口琴基本功-两页试排.pdf' : undefined
    if (alias) aliases.push({ filename, alias })
    console.log(`${index + 1}/${plan.entries.length} ${entry.title}: ${width}px, ${rendered.length} pages`)
  }
  assert.equal(selected.length, six.length)
  selected.sort((a, b) => six.indexOf(a.id) - six.indexOf(b.id))
  await page.setContent(style + selected.map(item => item.sections).join('')); await page.evaluate(() => document.fonts.ready)
  const collection = join(staged, '六首新增曲目-校验稿.pdf')
  await page.pdf({ path: collection, printBackground: true, preferCSSPageSize: true, timeout: 120000 })
  validate(collection, selected.reduce((sum, item) => sum + item.pages, 0), selected.map(item => item.url))
} finally { await browser.close() }
// Publish only after every staged PDF has passed validation and inputs still match.
for (const entry of record.entries) assert.equal(hash(readFileSync(join(root, 'src/scores', entry.file))), entry.sourceSha256)
const folder = join(output, '单曲PDF'); mkdirSync(folder, { recursive: true })
for (const item of results) copyFileSync(join(staged, item.file), join(folder, item.file))
for (const item of aliases) copyFileSync(join(staged, item.filename), join(output, item.alias))
copyFileSync(join(staged, '六首新增曲目-校验稿.pdf'), join(output, '六首新增曲目-校验稿.pdf'))
const report = { edition: plan.edition, entries: results, pageCount: results.reduce((sum, item) => sum + item.pages, 0), bytes: results.reduce((sum, item) => sum + item.bytes, 0) }
writeFileSync(join(temp, 'single-pdfs.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ scores: results.length, pages: report.pageCount, bytes: report.bytes }))
