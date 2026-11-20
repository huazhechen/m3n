import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'vite'

test('production HTML keeps hashed entry scripts and deferred application chunks external', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-hosting-build-'))
  try {
    await writeFile(join(root, 'index.html'), '<html><head></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>')
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src/main.js'), 'export const deferred = () => import("../deferred.js"); deferred()')
    await writeFile(join(root, 'deferred.js'), 'export default "deferred score page"; console.log("deferred module")')
    await build({ root, configFile: false, base: '/score/', logLevel: 'silent', build: { rollupOptions: { input: join(root, 'index.html') } } })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1])
    assert.equal(scripts.length, 1)
    assert.match(scripts[0], /^\/score\/assets\/index-[\w-]+\.js$/)
    assert.doesNotMatch(html, /<script\s+type="module">/)
    const assets = await readdir(join(root, 'dist/assets'))
    assert.ok(assets.some(file => /^index-[\w-]+\.js$/.test(file)))
    assert.ok(assets.some(file => file.endsWith('.js') && !file.startsWith('index-')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { scoreCatalogPlugin } from './score-catalog-plugin.ts'
import { worksCatalogPlugin } from './works-catalog-plugin.ts'
import { publishWeb, retentionMs } from './publish-web.mjs'

test('unlisted works stay outside the public catalog and book and preserve code hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-works-build-'))
  try {
    for (const folder of ['src/scores', 'src/works', 'src/assets', 'config/scorebook']) await mkdir(join(root, folder), { recursive: true })
    await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    await writeFile(join(root, 'main.js'), `import scores, { initializeCatalog, getScorebookPlan } from 'virtual:m3n-score-catalog'; import { getWorks, loadWorkSource } from 'virtual:m3n-works-catalog'; initializeCatalog().then(() => console.log(scores, getScorebookPlan(), getWorks(), loadWorkSource));`)
    await writeFile(join(root, 'config/scorebook/library-categories.json'), '[]')
    await writeFile(join(root, 'config/scorebook/editorial-plan.json'), '{"entries":[]}')
    await writeFile(join(root, 'src/assets/builtin-pdf-text.ttf'), 'font')
    const compile = async () => {
      await build({ root, configFile: false, base: '/score/', plugins: [scoreCatalogPlugin(), worksCatalogPlugin()], logLevel: 'silent', build: { assetsDir: 'assets/v2' } })
      const output = join(root, 'dist')
      const files = (await readdir(join(output, 'assets/v2'))).filter(file => file.endsWith('.js'))
      return {
        js: await Promise.all(files.sort().map(file => readFile(join(output, 'assets/v2', file), 'utf8'))),
        works: JSON.parse(await readFile(join(output, 'works-catalog.json'), 'utf8')),
        public: JSON.parse(await readFile(join(output, 'score-catalog.json'), 'utf8')),
      }
    }
    const empty = await compile()
    assert.deepEqual(empty.works, [])
    const source = '{title=Private work}{key=C#}{4/4}\nN: 1 2 3 4 |||'
    await writeFile(join(root, 'src/works/medley.m3n'), source)
    const added = await compile()
    assert.deepEqual(added.js, empty.js)
    assert.deepEqual(added.public, empty.public)
    assert.equal(added.works[0].slug, 'medley')
    assert.equal(await readFile(join(root, 'dist', added.works[0].sourceUrl), 'utf8'), source)
    assert.ok(added.js.join('').includes('/score/works-catalog.json'))
    await writeFile(join(root, 'src/works/medley.m3n'), source.replace('1 2 3 4', '4 3 2 1'))
    const edited = await compile()
    assert.deepEqual(edited.js, added.js)
    assert.notEqual(edited.works[0].sourceUrl, added.works[0].sourceUrl)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('score edits, additions, book metadata and font updates preserve every JavaScript hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-catalog-build-'))
  try {
    for (const folder of ['src/scores', 'src/assets', 'config/scorebook']) await mkdir(join(root, folder), { recursive: true })
    await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    await writeFile(join(root, 'main.js'), `import scores, { initializeCatalog, loadScoreSource, pdfFontUrl, getScorebookPlan } from 'virtual:m3n-score-catalog'; initializeCatalog().then(() => console.log(scores, loadScoreSource, pdfFontUrl(), getScorebookPlan()));`)
    await writeFile(join(root, 'config/scorebook/library-categories.json'), '[]')
    await writeFile(join(root, 'config/scorebook/editorial-plan.json'), '{"title":"Book"}')
    await writeFile(join(root, 'src/assets/builtin-pdf-text.ttf'), 'font one')
    await writeFile(join(root, 'src/scores/one.m3n'), '{title=One}\n{1=C}\n{4/4}\n1 2 3 4 |||\n')
    const compile = async () => {
      await build({ root, configFile: false, base: '/score/', plugins: [scoreCatalogPlugin()], logLevel: 'silent', build: { assetsDir: 'assets/v2' } })
      const files = await readdir(join(root, 'dist/assets/v2'))
      const js = Object.fromEntries(await Promise.all(files.filter(file => file.endsWith('.js')).map(async file => [file, await readFile(join(root, 'dist/assets/v2', file), 'utf8')])))
      const catalog = JSON.parse(await readFile(join(root, 'dist/score-catalog.json'), 'utf8'))
      for (const score of catalog.scores) assert.ok((await readFile(join(root, 'dist', score.sourceUrl), 'utf8')).includes('|||'))
      return { js, catalog }
    }
    const before = await compile()
    await writeFile(join(root, 'src/scores/one.m3n'), '{title=One revised}\n{1=C}\n{4/4}\n4 3 2 1 |||\n')
    const edited = await compile()
    assert.deepEqual(edited.js, before.js)
    assert.notEqual(edited.catalog.scores[0].sourceUrl, before.catalog.scores[0].sourceUrl)
    await writeFile(join(root, 'src/scores/two.m3n'), '{title=Two}\n{1=C}\n{4/4}\n1 1 1 1 |||\n')
    await writeFile(join(root, 'config/scorebook/library-categories.json'), '[{"id":"new","title":"New category","files":["two.m3n"]}]')
    await writeFile(join(root, 'src/assets/builtin-pdf-text.ttf'), 'font two')
    await writeFile(join(root, 'config/scorebook/editorial-plan.json'), '{"title":"Book revised"}')
    const added = await compile()
    assert.deepEqual(added.js, before.js)
    assert.equal(added.catalog.scores.length, 2)
    assert.equal(added.catalog.scores.find(score => score.slug === 'one').sourceUrl, edited.catalog.scores[0].sourceUrl)
    assert.notEqual(added.catalog.pdfFontUrl, edited.catalog.pdfFontUrl)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('publication retains retired dependencies for 72 hours and resets retirement on reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-retention-'))
  const destination = join(root, 'dist')
  const publish = async (files, now) => {
    const staging = await mkdtemp(join(root, 'stage-'))
    await mkdir(join(staging, 'assets/v2'), { recursive: true })
    await writeFile(join(staging, 'index.html'), 'current html')
    for (const file of files) await writeFile(join(staging, 'assets/v2', file), file)
    await publishWeb(staging, destination, { now })
    return readdir(join(destination, 'assets/v2'))
  }
  try {
    await publish(['old.js', 'shared.js'], 0)
    // A long-lived current asset gets its full grace period on retirement.
    assert.deepEqual(await publish(['new.js', 'shared.js'], retentionMs * 10), ['new.js', 'old.js', 'shared.js'])
    assert.ok((await publish(['new.js'], retentionMs * 11 - 1)).includes('old.js'))
    assert.ok(!(await publish(['new.js'], retentionMs * 11)).includes('old.js'))
    await publish(['new.js', 'shared.js'], retentionMs * 11 + 1)
    await publish(['new.js'], retentionMs * 12)
    assert.ok((await publish(['new.js'], retentionMs * 13 - 1)).includes('shared.js'))
    assert.ok(!(await publish(['new.js'], retentionMs * 13)).includes('shared.js'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

import { restoreWebHistory, historyFile } from './asset-history.mjs'

test('fresh Pages builds restore and expire history without keeping dist in Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm3n-pages-history-'))
  const output = join(root, 'first/dist')
  const stage = async (name, files) => {
    const directory = join(root, name)
    await mkdir(join(directory, 'assets/v2'), { recursive: true })
    await writeFile(join(directory, 'index.html'), name)
    for (const file of files) await writeFile(join(directory, 'assets/v2', file), file)
    return directory
  }
  const remote = directory => async url => {
    try {
      const path = new URL(url).pathname.replace('/score/', '')
      return new Response(await readFile(join(directory, path)), { headers: { 'content-type': path.endsWith('.json') ? 'application/json' : 'application/octet-stream' } })
    } catch { return new Response('Not found', { status: 404 }) }
  }
  try {
    await publishWeb(await stage('stage1', ['one.js', 'same.js']), output, { now: 0 })
    const fresh = join(root, 'second/dist')
    await restoreWebHistory(fresh, 'https://example.test/score/', { retentionMs, now: 10, fetchImpl: remote(output) })
    await publishWeb(await stage('stage2', ['two.js', 'same.js']), fresh, { now: 10 })
    assert.ok((await readdir(join(fresh, 'assets/v2'))).includes('one.js'))
    const history = JSON.parse(await readFile(join(fresh, historyFile), 'utf8'))
    assert.equal(history.assets.find(entry => entry.file.endsWith('/one.js')).retiredAt, 10)
    assert.equal(history.assets.find(entry => entry.file.endsWith('/same.js')).retiredAt, null)
    const third = join(root, 'third/dist')
    await restoreWebHistory(third, 'https://example.test/score/', { retentionMs, now: retentionMs + 10, fetchImpl: remote(fresh) })
    assert.ok(!(await readdir(join(third, 'assets/v2'))).includes('one.js'))
    assert.ok((await readdir(join(third, 'assets/v2'))).includes('same.js'))
    await assert.rejects(restoreWebHistory(join(root, 'unavailable/dist'), 'https://example.test/score/', { retentionMs, fetchImpl: async () => new Response('Unavailable', { status: 503 }) }), /HTTP 503/)
    await restoreWebHistory(join(root, 'bootstrap/dist'), 'https://example.test/score/', { retentionMs, fetchImpl: async () => new Response('<html>SPA</html>', { headers: { 'content-type': 'text/html' } }) })
    const corrupt = async url => String(url).endsWith('.json') ? remote(output)(url) : new Response('<html>SPA</html>')
    await assert.rejects(restoreWebHistory(join(root, 'corrupt/dist'), 'https://example.test/score/', { retentionMs, now: 10, fetchImpl: corrupt }), /checksum mismatch/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
