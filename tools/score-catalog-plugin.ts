import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
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

/** Only the generated index reaches the browser; score bodies remain independent lazy modules. */
export function scoreCatalogPlugin(): Plugin {
  let root: string
  let scoreDirectory: string
  let planPath: string
  return {
    name: 'm3n-score-catalog',
    configResolved(config) { root = config.root; scoreDirectory = resolve(config.root, 'src/scores'); planPath = resolve(config.root, 'scorebook/library-categories.json') },
    resolveId(id) { if (id === moduleId) return resolvedId },
    async load(id) {
      if (id !== resolvedId) return
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
        return { modifiedAt, ...scoreMetadataFromSource(slug, await readFile(filePath, 'utf8')), category: categories.get(file.split(/[\\/]/).at(-1)!), sourcePath: file.replaceAll('\\', '/') }
      }))
      if (new Set(scores.map(score => score.slug)).size !== scores.length) throw new Error('内置曲库包含重复的乐谱 ID。')
      return `export default ${JSON.stringify(sortScoresByTitle(scores))}`
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
