import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { scoreMetadataFromSource } from '@m3n/notation'
import { sortScoresByTitle } from '../src/lib/score-order.ts'

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
  let base: string
  let catalog: unknown
  const assets = new Map<string, string | Buffer>()
  return {
    name: 'm3n-score-catalog',
    configResolved(config) { production = config.command === 'build'; base = config.base; root = config.root; scoreDirectory = resolve(config.root, 'src/scores'); planPath = resolve(config.root, 'config/scorebook/library-categories.json') },
    resolveId(id) { if (id === moduleId) return resolvedId },
    async load(id) {
      if (id !== resolvedId) return
      const asset = (name: string, source: string | Buffer) => {
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
        const file = `assets/v2/${hash}-${name}`
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
      const files = (await readdir(scoreDirectory, { recursive: true })).filter(file => file.endsWith('.m3n')).sort()
      const scores = await Promise.all(files.map(async file => {
        const filePath = resolve(scoreDirectory, file)
        this.addWatchFile(filePath)
        const slug = file.split(/[\\/]/).at(-1)?.replace(/\.m3n$/, '') ?? file
        const modifiedAt = modifiedTimes.get(`src/scores/${file.replaceAll('\\', '/')}`) ?? (await stat(filePath)).mtimeMs
        const source = await readFile(filePath, 'utf8')
        const sourceUrl = production ? asset('score.m3n', source) : ''
        return { sourceUrl, modifiedAt, ...scoreMetadataFromSource(slug, source), category: categories.get(file.split(/[\\/]/).at(-1)!), sourcePath: file.replaceAll('\\', '/') }
      }))
      if (new Set(scores.map(score => score.slug)).size !== scores.length) throw new Error('内置曲库包含重复的乐谱 ID。')
      if (!production) return `
        import fontUrl from '/src/assets/builtin-pdf-text.ttf?url';
        import plan from '/config/scorebook/editorial-plan.json';
        export const getScorebookPlan = () => plan;
        export const pdfFontUrl = () => fontUrl;
        export default ${JSON.stringify(sortScoresByTitle(scores))};
        export async function initializeCatalog() {};
        const modules = import.meta.glob('/src/scores/**/*.m3n', { query: '?raw', import: 'default' });
        export const loadScoreSource = score => modules['/src/scores/' + score.sourcePath]();
      `
      catalog = { plan: JSON.parse(await readFile(resolve(root, 'config/scorebook/editorial-plan.json'), 'utf8')), scores: sortScoresByTitle(scores), pdfFontUrl: asset('builtin-pdf-text.ttf', await readFile(resolve(root, 'src/assets/builtin-pdf-text.ttf'))) }
      return `
        const scores = []; export default scores;
        let fontUrl, plan;
        export const getScorebookPlan = () => plan;
        export const pdfFontUrl = () => ${JSON.stringify(base)} + fontUrl;
        export async function initializeCatalog() {
          const response = await fetch(${JSON.stringify(base + 'score-catalog.json')}, { cache: 'no-cache' });
          if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('曲库目录加载失败，请刷新重试。');
          const catalog = await response.json();
          scores.splice(0, scores.length, ...catalog.scores);
          fontUrl = catalog.pdfFontUrl;
          plan = catalog.plan;
        }
        export async function loadScoreSource(score) {
          const response = await fetch(${JSON.stringify(base)} + score.sourceUrl);
          if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('乐谱加载失败，请刷新重试。');
          return response.text();
        }
      `
    },
    generateBundle() {
      if (!production || !catalog) return
      this.emitFile({ type: 'asset', fileName: 'score-catalog.json', source: JSON.stringify(catalog) })
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source })
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
