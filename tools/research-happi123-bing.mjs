import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sourceDirectory = path.resolve('src/scores/happi123')
const tempoOnly = process.argv.includes('--tempo')
const reportPath = path.resolve(tempoOnly ? '.tmp/happi123-bing-tempo-research.json' : '.tmp/happi123-bing-research.json')
const requestDelayMs = 2_000

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function textOnly(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function resultSnippets(html) {
  const results = []
  const pattern = /<li\b[^>]*\bclass="[^"]*\bb_algo\b[^"]*"[\s\S]*?<\/li>/g
  for (const match of html.matchAll(pattern)) {
    const section = match[0]
    const href = /<a[^>]+href="([^"]+)"/.exec(section)?.[1] ?? ''
    const title = textOnly(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(section)?.[1] ?? '')
    const snippet = textOnly(/<p[^>]*>([\s\S]*?)<\/p>/.exec(section)?.[1] ?? '')
    if (title || snippet) results.push({ title, href, snippet })
  }
  return results.slice(0, 5)
}

function sourceIdentity(source) {
  const title = /^\{title:([^}]*)\}/m.exec(source)?.[1]?.trim() ?? ''
  const lyricBlock = /\{lyric\}([\s\S]*?)\{\/lyric\}/.exec(source)?.[1] ?? ''
  const lyric = lyricBlock.replace(/[^\u3400-\u9fff]/g, '').slice(0, 18)
  return { title, lyric }
}

const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.h123')).sort()
const report = []
for (const [index, file] of files.entries()) {
  const source = await readFile(path.join(sourceDirectory, file), 'utf8')
  const { title, lyric } = sourceIdentity(source)
  const query = tempoOnly
    ? `${title}${lyric ? ` ${lyric}` : ''} 原曲 BPM 速度`
    : `${title}${lyric ? ` ${lyric}` : ''} 原唱 作词 作曲 BPM`
  const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; m3n metadata research)' },
  })
  const html = await response.text()
  report.push({ file, title, lyric, query, fetchedAt: new Date().toISOString(), status: response.status, results: resultSnippets(html) })
  process.stdout.write(`${String(index + 1).padStart(2, '0')}/${files.length} ${file} ${response.status}\n`)
  if (index < files.length - 1) await new Promise((resolve) => setTimeout(resolve, requestDelayMs))
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Wrote ${report.length} Bing research entries to ${reportPath}`)
