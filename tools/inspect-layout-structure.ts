import fs from 'node:fs'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import { m3nToMei } from '../src/lib/m3n-mei'

const source = fs.readFileSync('src/scores/07_00003.m3n', 'utf8')
const rawMei = m3nToMei(source).mei
const mei = rawMei
  .replace(/<section/g, '\n<section')
  .replace(/<ending/g, '\n<ending')
  .replace(/<sb\/>/g, '\n<sb/>')
  .replace(/<measure /g, '\n<measure ')

console.log(mei.split('\n').filter((line) => /<(?:section|ending|sb|measure)\b/.test(line)).join('\n'))

const toolkit = new VerovioToolkit(await createVerovioModule())
toolkit.setOptions({ adjustPageHeight: true, breaks: 'line', footer: 'none', header: 'none', pageHeight: 60000, pageWidth: 800, scale: 42 })
if (!toolkit.loadData(rawMei)) throw new Error(toolkit.getLog())
for (let page = 1; page <= toolkit.getPageCount(); page += 1) {
  const systems = toolkit.renderToSVG(page).split('class="system"').slice(1).map((system) => (
    [...system.matchAll(/id="(m3n-measure-[0-9]+-[0-9]+)"/g)].map((match) => match[1])
  )).filter((system) => system.length > 0)
  console.log(`page ${page}:`, JSON.stringify(systems))
}
toolkit.destroy()
