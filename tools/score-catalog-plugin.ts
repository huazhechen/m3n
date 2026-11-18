import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { scoreMetadataFromSource } from '@m3n/notation'
import { sortScoresByTitle } from '../src/lib/score-order.ts'

const moduleId = 'virtual:m3n-score-catalog'
const resolvedId = `\0${moduleId}`

/** Only the generated index reaches the browser; score bodies remain independent lazy modules. */
export function scoreCatalogPlugin(): Plugin {
  let scoreDirectory: string
  let planPath: string
  return {
    name: 'm3n-score-catalog',
    configResolved(config) { scoreDirectory = resolve(config.root, 'src/scores'); planPath = resolve(config.root, 'scorebook/library-categories.json') },
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
      const files = (await readdir(scoreDirectory, { recursive: true })).filter(file => file.endsWith('.m3n')).sort()
      const scores = await Promise.all(files.map(async file => {
        const filePath = resolve(scoreDirectory, file)
        this.addWatchFile(filePath)
        const slug = file.split(/[\\/]/).at(-1)?.replace(/\.m3n$/, '') ?? file
        return { ...scoreMetadataFromSource(slug, await readFile(filePath, 'utf8')), category: categories.get(file.split(/[\\/]/).at(-1)!), sourcePath: file.replaceAll('\\', '/') }
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
