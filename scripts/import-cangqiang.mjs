import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = 'https://www.cangqiang.com.cn'
const scoreDirectory = resolve('src/scores/happi123')

function convertNote(token) {
  const match = /^(0|[1-7])([#bn]?)([,"']*)([_=]*)(\.*)(-*)$/.exec(token)
  if (!match) return token
  const [, degree, accidental, octave, shortDuration, dots, longDuration] = match
  const octaves = `${'d'.repeat((octave.match(/,/g) ?? []).length)}${'e'.repeat((octave.match(/'/g) ?? []).length + (octave.match(/"/g) ?? []).length * 2)}`
  const long = longDuration.length === 0 ? '' : longDuration.length === 1 ? '^' : longDuration.length === 2 ? '^.' : '^'.repeat(longDuration.length - 1)
  const value = `${degree}${accidental === 'n' ? '=' : accidental}${octaves}${long}${dots}`
  const depth = shortDuration.includes('=') ? 2 : shortDuration.length
  return depth ? `${'('.repeat(depth)}${value}${')'.repeat(depth)}` : value
}

function toM3n({ title, key, meter, source, lyrics }) {
  const normalizedKey = /^1=([A-G](?:#|b)?)$/.exec(key.trim())?.[1] ?? (key.trim() || 'C')
  let music = source
    .replace(/\{![\s\S]*?!\}/g, '')
    .replace(/\{hot\}/g, '')
    .replace(/\{(?:title|subtitle|key_signature|time_signature|bpm|play):\s*[^}]*\}/g, '')
    .replace(/\{mark:\s*([^}]+)\}/g, (_match, part) => `{part=${part.trim()}}`)
    .replace(/\{chord:\s*([^}]+)\}/g, (_match, chord) => `{chord=${chord.trim()}}`)
    .replace(/([0-7][#bn]?)([gd]*)([,"']*)(x*)([,"']*)/g, (_match, note, shifts, leadingOctave, shortDuration, trailingOctave) => {
      const normalizedOctave = `${leadingOctave}${trailingOctave}${'\''.repeat((shifts.match(/g/g) ?? []).length)}${','.repeat((shifts.match(/d/g) ?? []).length)}`
      return `${note}${normalizedOctave}${'_'.repeat(shortDuration.length)}`
    })
    .replace(/\{\{/g, '')
    .replace(/\}\}/g, '')
    .replace(/(^|\s)([A-Z]):/gm, '$1{part=$2}')
    .replace(/\([^)]*\)/g, (group) => group.replace(/[()]/g, ''))
    .replace(/(?:0|[1-7])[#bn]?[,"']*[_=]*\.*-*/g, convertNote)
    .replace(/v/g, '{breath}')
    .replace(/\s+/g, ' ')
    .trim()

  return [
    `{title=${title}}`,
    `{key=${normalizedKey}} {${meter || '4/4'}}`,
    music,
    ...lyrics.flatMap((lyric) => ['', '{lyrics}', lyric, '{/}']),
    '',
  ].join('\n')
}

function toHappi123(source, lyrics) {
  const lyricBlocks = lyrics
    .map((lyric) => `{lyric}\n${lyric}\n{/lyric}`)
    .join('\n\n')
  return `${source.trim()}${lyricBlocks ? `\n\n${lyricBlocks}` : ''}\n`
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 0
    this.pending = new Map()
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        pending.resolve(message)
      }
    }
  }

  static async connect() {
    const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
    const target = targets.find((item) => item.type === 'page' && item.url.includes('cangqiang.com.cn'))
    if (!target) throw new Error('No cangqiang.com.cn page is open in the remote-debugging browser.')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    return new Cdp(ws)
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 20_000)
      this.pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result) } })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text)
    return result.result?.result?.value
  }

  async navigate(url) {
    await this.call('Page.navigate', { url })
  }

  close() { this.ws.close() }
}

async function waitForEditor(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = await cdp.evaluate(`typeof editor === 'undefined' ? '' : editor.getValue()`)
    if (value) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Professional editor did not load.')
}

async function getWorks(cdp) {
  const works = []
  for (let page = 1; ; page += 1) {
    // The site itself uses this endpoint for each "加载更多" page.
    const response = await cdp.evaluate(`fetch('/myfabu.html?dopost=getMyfabu&type=0&pageno=${page}').then(r => r.json())`, true)
    const batch = response?.data?.myfabu ?? []
    if (!batch.length) break
    works.push(...batch)
    if (batch.length < 10) break
  }
  return [...new Map(works.map((work) => [String(work.id), work])).values()]
}

const cdp = await Cdp.connect()
try {
  await cdp.navigate(`${baseUrl}/myfabu.html`)
  const works = await getWorks(cdp)
  if (!works.length) throw new Error('No works returned by the signed-in account.')
  await mkdir(scoreDirectory, { recursive: true })
  console.log(`Found ${works.length} works.`)

  for (let index = 0; index < works.length; index += 1) {
    const work = works[index]
    await cdp.navigate(`${baseUrl}/jianpu/zhuanye.html?id=${encodeURIComponent(work.id)}`)
    await waitForEditor(cdp)
    const data = await cdp.evaluate(`(() => ({
      title: document.querySelector('#song_name')?.value || ${JSON.stringify(work.title ?? '')},
      key: document.querySelector('#key_signature')?.value || 'C',
      meter: document.querySelector('#time_signature')?.value || '4/4',
      source: typeof editor === 'undefined' ? '' : editor.getValue(),
      lyrics: [...document.querySelectorAll('textarea.lyric-input')].map(x => x.value.trim()).filter(Boolean),
    }))()`)
    const source = toHappi123(data.source, data.lyrics)
    const filename = String(work.id)
    await writeFile(resolve(scoreDirectory, `${filename}.h123`), source, 'utf8')
    await writeFile(resolve(scoreDirectory, `${filename}.m3n`), toM3n({ ...data, source }), 'utf8')
    console.log(`${index + 1}/${works.length} ${filename} ${data.title}`)
  }
} finally {
  cdp.close()
}
