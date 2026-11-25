import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { scoreMetadataFromSource } from '@m3n/notation'
import { sortScoresByTitle } from '../src/lib/score-order.ts'
import { compressedSources, libraryFontBundle } from './library-bundles.ts'

const execFileAsync = promisify(execFile)

// Git dates survive fresh checkouts; uncommitted scores use their working file time.
async function scoreModificationTimes(root: string) {
  const times = new Map<string, number>()
  try {
    const [history, dirty] = await Promise.all([
      execFileAsync('git', ['log', '--format=@%ct', '--name-only', '--', 'src/scores'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }),
      execFileAsync('git', ['diff', '--name-only', 'HEAD', '--', 'src/scores'], { cwd: root }),
    ])
    let timestamp = 0
    for (const line of history.stdout.split('\n')) {
      if (/^@\d+$/.test(line)) timestamp = Number(line.slice(1)) * 1000
      else if (line.startsWith('src/scores/') && !times.has(line)) times.set(line, timestamp)
    }
    for (const file of dirty.stdout.trim().split('\n')) times.delete(file)
  } catch { /* Source archives without Git fall back to file modification times. */ }
  return times
}

const moduleId = 'virtual:m3n-score-catalog'
const resolvedId = `\0${moduleId}`

/** Production data stays outside the module graph so score changes preserve code hashes. */
export function scoreCatalogPlugin(): Plugin {
  let root: string
  let scoreDirectory: string
  let planPath: string
  let production = false
  let testing = false
  let base: string
  let catalog: { scores: unknown[]; bundles: { sources: { url: string; bytes: number }; fonts: { url: string; bytes: number } } } | undefined
  const assets = new Map<string, string | Buffer>()
  return {
    name: 'm3n-score-catalog',
    configResolved(config) { production = config.command === 'build'; testing = config.mode === 'test'; base = config.base; root = config.root; scoreDirectory = resolve(config.root, 'src/scores'); planPath = resolve(config.root, 'config/scorebook/library-categories.json') },
    resolveId(id) { if (id === moduleId) return resolvedId },
    async load(id) {
      if (id !== resolvedId) return
      const asset = (name: string, source: string | Buffer) => {
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
        const file = `assets/${hash}-${name}`
        assets.set(file, source)
        return file
      }
      this.addWatchFile(planPath)
      const categoriesConfig = JSON.parse(await readFile(planPath, 'utf8')) as Array<{ id: string; title: string; files: string[] }>
      const categories = new Map<string, { id: string; title: string; order: number; itemOrder: number }>()
      for (const [order, category] of categoriesConfig.entries()) {
        for (const [itemOrder, file] of category.files.entries()) {
          if (categories.has(file)) throw new Error(`曲库分类重复：${file}`)
          categories.set(file, { id: category.id, title: category.title, order, itemOrder })
        }
      }
      const modifiedTimes = await scoreModificationTimes(root)
      this.addWatchFile(scoreDirectory)
      const files = (await readdir(scoreDirectory, { recursive: true })).filter(file => file.endsWith('.m3n')).sort()
      const sources: Record<string, string> = {}
      const scores = await Promise.all(files.map(async file => {
        const filePath = resolve(scoreDirectory, file)
        this.addWatchFile(filePath)
        const slug = file.split(/[\\/]/).at(-1)?.replace(/\.m3n$/, '') ?? file
        const modifiedAt = modifiedTimes.get(`src/scores/${file.replaceAll('\\', '/')}`) ?? (await stat(filePath)).mtimeMs
        const source = await readFile(filePath, 'utf8')
        const sourcePath = file.replaceAll('\\', '/')
        sources[sourcePath] = source
        return { modifiedAt, ...scoreMetadataFromSource(slug, source), category: categories.get(file.split(/[\\/]/).at(-1)!), sourcePath }
      }))
      if (new Set(scores.map(score => score.slug)).size !== scores.length) throw new Error('内置曲库包含重复的乐谱 ID。')
      if (testing) return `
        export default ${JSON.stringify(sortScoresByTitle(scores))};
        export async function initializeCatalog() {};
        export async function prepareCatalogResources() {};
        const modules = import.meta.glob('/src/scores/**/*.m3n', { query: '?raw', import: 'default' });
        export const loadScoreSource = score => modules['/src/scores/' + score.sourcePath]();
      `
      // Stable source order preserves the package hash independently of metadata.
      const sourceData = compressedSources(Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))))
      const fontData = await libraryFontBundle()
      catalog = { scores: sortScoresByTitle(scores), bundles: {
        sources: { url: base + asset('scores.json.gz', sourceData), bytes: sourceData.length },
        fonts: { url: base + asset('score-fonts.bin.gz', fontData), bytes: fontData.length },
      } }
      const runtime = fileURLToPath(new URL('../src/lib/library-resources.ts', import.meta.url))
      return `
        import { createLibraryResources } from ${JSON.stringify(runtime)};
        const scores = ${production ? '[]' : JSON.stringify(catalog.scores)}; export default scores;
        let bundles = ${production ? 'undefined' : JSON.stringify(catalog.bundles)}, resources;
        export async function initializeCatalog() {
          ${production ? '' : 'return;'}
          const response = await fetch(${JSON.stringify(base + 'score-catalog.json')}, { cache: 'no-cache' });
          if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('曲库目录加载失败，请刷新重试。');
          const catalog = await response.json();
          scores.splice(0, scores.length, ...catalog.scores);
          bundles = catalog.bundles;
        }
        function library() {
          if (!bundles) throw new Error('曲库目录尚未准备好，请刷新页面重试。');
          return resources ??= createLibraryResources(bundles);
        }
        export function prepareCatalogResources(options) { return library().prepare(options); }
        export async function loadScoreSource(score) {
          return library().source(score.sourcePath);
        }
      `
    },
    generateBundle() {
      if (!production || !catalog) return
      this.emitFile({ type: 'asset', fileName: 'score-catalog.json', source: JSON.stringify(catalog) })
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = request.url?.split('?')[0]?.slice(base.length)
        const data = file ? assets.get(file) : undefined
        if (!data) return next()
        response.setHeader('Content-Type', 'application/gzip')
        response.setHeader('Content-Length', Buffer.byteLength(data))
        response.end(data)
      })
    },
    handleHotUpdate(context) {
      if (context.file !== planPath && (!context.file.startsWith(scoreDirectory) || !context.file.endsWith('.m3n'))) return
      const index = context.server.moduleGraph.getModuleById(resolvedId)
      if (index) {
        context.server.moduleGraph.invalidateModule(index)
        return [...context.modules, index]
      }
    },
  }
}
