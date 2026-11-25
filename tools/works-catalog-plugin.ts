import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { scoreMetadataFromSource } from '@m3n/notation'
import { sortScoresByTitle } from '../src/lib/score-order.ts'
import { scoreFontPreloads, type FontPreload } from './score-font-preloads.ts'

/** Unlisted works have their own catalog; public library and book never consume it. */
export function worksCatalogPlugin(): Plugin {
  const id = 'virtual:m3n-works-catalog'
  const resolvedId = `\0${id}`
  let directory: string
  let production: boolean
  let base: string
  let catalog: Array<{ fontPreloads: FontPreload[] }> | undefined
  return {
    name: 'm3n-works-catalog',
    configResolved(config) {
      directory = resolve(config.root, 'src/works')
      production = config.command === 'build'
      base = config.base
    },
    resolveId(value) { if (value === id) return resolvedId },
    async load(value) {
      if (value !== resolvedId) return
      this.addWatchFile(directory)
      const files = (await readdir(directory)).filter(file => file.endsWith('.m3n')).sort()
      const works = sortScoresByTitle(await Promise.all(files.map(async file => {
        const path = resolve(directory, file)
        this.addWatchFile(path)
        const source = await readFile(path, 'utf8')
        const slug = file.slice(0, -4)
        if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(slug)) throw new Error(`独立作品文件名无效：${file}`)
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
        const sourceUrl = `assets/${hash}-work.m3n`
        if (production) this.emitFile({ type: 'asset', fileName: sourceUrl, source })
        const fontPreloads = await scoreFontPreloads(source, (name, source) => this.emitFile({ type: 'asset', name, source }), path => this.addWatchFile(path), production)
        return { ...scoreMetadataFromSource(slug, source), sourceUrl, fontPreloads, sourcePath: file, modifiedAt: (await stat(path)).mtimeMs }
      })))
      if (!production) return `
        const works = ${JSON.stringify(works)};
        export const getWorks = async () => works;
        const sources = import.meta.glob('/src/works/*.m3n', { query: '?raw', import: 'default' });
        export const loadWorkSource = work => sources['/src/works/' + work.sourcePath]();
      `
      catalog = works
      return `
        let pending;
        export function getWorks() {
          return pending ??= fetch(${JSON.stringify(base + 'works-catalog.json')}, { cache: 'no-cache' })
            .then(response => {
              if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('独立作品加载失败，请重试。');
              return response.json();
            }).catch(error => { pending = undefined; throw error; });
        }
        export async function loadWorkSource(work) {
          const response = await fetch(${JSON.stringify(base)} + work.sourceUrl);
          if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('乐谱加载失败，请重试。');
          return response.text();
        }
      `
    },
    generateBundle() {
      if (!production || !catalog) return
      const works = catalog.map(work => ({ ...work, fontPreloads: work.fontPreloads.map(font => ({ ...font, url: base + this.getFileName(font.url) })) }))
      this.emitFile({ type: 'asset', fileName: 'works-catalog.json', source: JSON.stringify(works) })
    },
    handleHotUpdate(context) {
      if (!context.file.startsWith(directory) || !context.file.endsWith('.m3n')) return
      const module = context.server.moduleGraph.getModuleById(resolvedId)
      if (module) {
        context.server.moduleGraph.invalidateModule(module)
        return [...context.modules, module]
      }
    },
  }
}
