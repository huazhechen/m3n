import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '..')
const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')

/** Validate committed font outputs without requiring Python during web builds. */
export async function libraryFontBundle() {
  const directory = resolve(root, 'tools/fonts/library')
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as {
    inputs: Record<string, string>
    fonts: Array<{ file: string; characters: string; weight: number; style: string; bytes: number; sha256: string }>
  }
  const sources = []
  for (const directory of ['scores', 'works', 'examples']) {
    for (const file of await readdir(resolve(root, 'src', directory), { recursive: true })) {
      if (file.endsWith('.m3n')) sources.push(`src/${directory}/${file.replaceAll('\\', '/')}`)
    }
  }
  if (sources.some(file => !manifest.inputs[file]) || Object.keys(manifest.inputs).filter(file => file.endsWith('.m3n')).length !== sources.length) {
    throw new Error('全库字体输入已变化，请运行 npm run prepare:library-fonts。')
  }
  for (const [file, digest] of Object.entries(manifest.inputs)) {
    if (hash(await readFile(resolve(root, file))) !== digest) throw new Error(`全库字体已过期：${file}。请运行 npm run prepare:library-fonts。`)
  }
  const payload: Buffer[] = [], entries = []
  let offset = 0
  for (const font of manifest.fonts) {
    const data = await readFile(resolve(directory, font.file))
    if (data.length !== font.bytes || hash(data) !== font.sha256) throw new Error(`全库字体校验失败：${font.file}`)
    entries.push({ ...font, offset, length: data.length })
    payload.push(data); offset += data.length
  }
  const index = Buffer.from(JSON.stringify(entries))
  const length = Buffer.alloc(4)
  length.writeUInt32LE(index.length)
  return gzipSync(Buffer.concat([length, index, ...payload]), { level: 9 })
}

export function compressedSources(sources: Record<string, string>) {
  return gzipSync(Buffer.from(JSON.stringify(sources)), { level: 9 })
}
