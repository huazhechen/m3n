import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

const scoreDirectory = resolve('src/scores')
const sourceDirectory = resolve(scoreDirectory, 'happi123')

async function loadConverters() {
  const [happiSource, m3nSource] = await Promise.all([
    readFile(resolve('src/lib/happi123-m3n.ts'), 'utf8'),
    readFile(resolve('src/lib/m3n-abc.ts'), 'utf8'),
  ])
  const compile = (source) => ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const m3nUrl = `data:text/javascript;base64,${Buffer.from(compile(m3nSource)).toString('base64')}`
  const happiUrl = `data:text/javascript;base64,${Buffer.from(compile(happiSource.replace("import type { ConversionResult } from './m3n-abc'", ''))).toString('base64')}`
  const [m3n, happi] = await Promise.all([import(m3nUrl), import(happiUrl)])
  return { ...m3n, ...happi }
}

function sanitizeM3N(source) {
  const protectedBlocks = []
  const main = source.replace(/\{lyrics(?:=[^}]*)?\}[\s\S]*?\{\/\}/g, (block) => {
    protectedBlocks.push(block)
    return `\u0000${protectedBlocks.length - 1}\u0000`
  })
  const tokens = main.match(/\u0000\d+\u0000|\{[^}]*\}|(?:0|[1-7])[#b=]*[ed]*\^*\.*~?|[()|]|\s+/g) ?? []
  return tokens.join('')
    .replace(/\u0000(\d+)\u0000/g, (_match, index) => protectedBlocks[Number(index)])
    .replace(/\|{4,}/g, '|||')
}

const { happi123ToM3N, m3nToAbc } = await loadConverters()
const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.h123')).sort()
const failures = []

for (const file of files) {
  const source = await readFile(resolve(sourceDirectory, file), 'utf8')
  const converted = happi123ToM3N(source)
  const output = sanitizeM3N(converted.output)
  const parsed = m3nToAbc(output)
  if (parsed.diagnostics.length) {
    const title = source.match(/\{title:\s*([^}]*)\}/)?.[1]?.trim() || file.replace(/\.h123$/, '')
    const key = source.match(/\{key_signature:\s*([^}]*)\}/)?.[1]?.trim().replace(/^1=([#b]?)([A-G]).*$/i, '$2$1') || 'C'
    const meter = source.match(/\{time_signature:\s*(\d+\/\d+)/)?.[1] || '4/4'
    await writeFile(resolve(scoreDirectory, file.replace(/\.h123$/, '.m3n')), `{title=${title}}\n{key=${key}} {${meter}}\n0\n`, 'utf8')
    failures.push(file)
    continue
  }
  await writeFile(resolve(scoreDirectory, file.replace(/\.h123$/, '.m3n')), `${output}\n`, 'utf8')
}

console.log(`Converted and parsed ${files.length - failures.length} scores; ${failures.length} fallback score.`)
