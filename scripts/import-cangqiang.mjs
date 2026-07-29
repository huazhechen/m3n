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

function toHappi123({ title, key, meter, bpm, source, lyrics }) {
  const music = source
    .replace(/\{(?:title|key_signature|time_signature|bpm):\s*[^}]*\}\s*/g, '')
    .trim()
  const lyricBlocks = lyrics
    .map((lyric) => `{lyric}\n${lyric}\n{/lyric}`)
    .join('\n\n')
  return [
    `{title:${title}}`,
    `{key_signature:${key || 'C'}}`,
    `{time_signature:${meter || '4/4'}}`,
    bpm ? `{bpm:${bpm}}` : '',
    '',
    music,
    lyricBlocks ? `\n${lyricBlocks}` : '',
    '',
  ].filter(Boolean).join('\n')
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
    const data = await cdp.evaluate(`(() => {
      document.querySelectorAll('.tab, [data-tab], a, button').forEach((element) => {
        if (element.textContent?.trim() === '歌词') element.click()
      })
      return {
      title: document.querySelector('#song_name')?.value || ${JSON.stringify(work.title ?? '')},
      key: document.querySelector('#key_signature')?.value || 'C',
      meter: document.querySelector('#time_signature')?.value || '4/4',
      bpm: document.querySelector('#bpm')?.value || '',
      source: typeof editor === 'undefined' ? '' : editor.getValue(),
      lyrics: [...document.querySelectorAll('textarea')].map(x => x.value.trim()).filter(Boolean),
    }
    })()`)
    const source = toHappi123(data)
    const filename = String(work.id)
    await writeFile(resolve(scoreDirectory, `${filename}.h123`), source, 'utf8')
    console.log(`${index + 1}/${works.length} ${filename} ${data.title}`)
  }
} finally {
  cdp.close()
}
