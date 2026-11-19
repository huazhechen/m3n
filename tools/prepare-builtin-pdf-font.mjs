import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const digest = value => createHash('sha256').update(value).digest('hex')

/** Conservative source superset includes lyrics, credits, headings and renderer symbols. */
export function builtinPdfCharacters() {
  const read = file => readFileSync(join(root, file), 'utf8')
  const inputs = [read('config/scorebook/editorial-plan.json'), read('src/lib/online-scorebook.ts')]
  for (const file of readdirSync(join(root, 'src/scores')).filter(file => file.endsWith('.m3n')).sort()) inputs.push(read(`src/scores/${file}`))
  for (const file of readdirSync(join(root, 'packages/numbered-notation/src')).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts')).sort()) inputs.push(read(`packages/numbered-notation/src/${file}`))
  inputs.push(Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join(''))
  return [...new Set(inputs.join(''))].filter(char => char.codePointAt(0) >= 32).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('')
}

export function prepareBuiltinPdfFont({ check = false } = {}) {
  const characters = builtinPdfCharacters()
  const source = readFileSync(join(root, 'tools/fonts/NotoSerifCJKsc-Regular.otf'))
  const font = fontkit.create(source)
  const covered = [...characters].filter(char => font.hasGlyphForCodePoint(char.codePointAt(0))).join('')
  const fingerprint = digest(covered + digest(source) + readFileSync(join(root, 'tools/subset-builtin-pdf-font.py'), 'utf8'))
  const output = join(root, 'src/assets/builtin-pdf-text.ttf')
  const manifest = join(root, 'src/assets/builtin-pdf-text.json')
  if (existsSync(output) && existsSync(manifest)) {
    const previous = JSON.parse(readFileSync(manifest, 'utf8'))
    if (previous.fingerprint === fingerprint && previous.sha256 === digest(readFileSync(output))) return previous
  }
  if (check) throw new Error('内置PDF字体子集需要更新。运行 node tools/prepare-builtin-pdf-font.mjs（Python需要fonttools）。')
  mkdirSync(dirname(output), { recursive: true })
  mkdirSync(join(root, '.tmp'), { recursive: true })
  const charsetFile = join(root, '.tmp/builtin-pdf-characters.txt')
  writeFileSync(charsetFile, covered)
  execFileSync(process.env.M3N_FONT_PYTHON || 'python3', [join(root, 'tools/subset-builtin-pdf-font.py'), join(root, 'tools/fonts/NotoSerifCJKsc-Regular.otf'), charsetFile, output], { stdio: 'inherit' })
  const bytes = readFileSync(output), subsetFont = fontkit.create(bytes)
  for (const char of covered) if (!subsetFont.hasGlyphForCodePoint(char.codePointAt(0))) throw new Error(`Font subset missing ${char}`)
  const result = { fingerprint, sha256: digest(bytes), characters: [...covered].length, bytes: bytes.length, font: 'Noto Serif CJK SC Regular 2.003', license: 'SIL OFL 1.1' }
  writeFileSync(manifest, JSON.stringify(result, null, 2) + '\n')
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(prepareBuiltinPdfFont({ check: process.argv.includes('--check') }))
