import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { happi123ToM3N } from '../src/lib/happi123-m3n'
import { validateM3N } from '../src/lib/m3n-validate'

type FileReport = {
  slug: string
  conversionDiagnostics: string[]
  validationDiagnostics: string[]
  output: string
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(root, 'src', 'scores', 'happi123')
const targetDirectory = path.join(root, 'src', 'scores')
const shouldWrite = process.argv.includes('--write')
const showDetails = process.argv.includes('--details')
const showMeasures = process.argv.includes('--measures')
const selectedSlug = process.argv.find((argument) => argument.startsWith('--slug='))?.slice('--slug='.length)

function diagnosticKind(message: string) {
  return message
    .replace(/：.*$/, '')
    .replace(/\{[^}]+\}/g, '{...}')
}

const files = (await readdir(sourceDirectory))
  .filter((file) => file.endsWith('.h123'))
  .sort((left, right) => left.localeCompare(right))
const reports: FileReport[] = []

for (const file of files) {
  const source = await readFile(path.join(sourceDirectory, file), 'utf8')
  const result = happi123ToM3N(source)
  const slug = file.replace(/\.h123$/, '')
  const report = {
    slug,
    conversionDiagnostics: result.diagnostics,
    validationDiagnostics: validateM3N(result.output),
    output: `${result.output.trim()}\n`,
  }
  reports.push(report)

  if (shouldWrite) {
    await writeFile(path.join(targetDirectory, `${slug}.m3n`), report.output, 'utf8')
  }
}

const conversionKinds = new Map<string, number>()
for (const diagnostic of reports.flatMap((report) => report.conversionDiagnostics)) {
  const kind = diagnosticKind(diagnostic)
  conversionKinds.set(kind, (conversionKinds.get(kind) ?? 0) + 1)
}

console.log(`Happi123 files: ${reports.length}`)
console.log(`Files with conversion diagnostics: ${reports.filter((report) => report.conversionDiagnostics.length > 0).length}`)
console.log(`Files with M3N validation diagnostics: ${reports.filter((report) => report.validationDiagnostics.length > 0).length}`)
console.log('\nConversion diagnostics:')
for (const [kind, count] of [...conversionKinds].sort((left, right) => right[1] - left[1])) {
  console.log(`${String(count).padStart(4)}  ${kind}`)
}

console.log('\nPer-file diagnostics:')
for (const report of reports.filter((item) => item.conversionDiagnostics.length > 0 || item.validationDiagnostics.length > 0)) {
  console.log(
    `${report.slug}  conversion=${report.conversionDiagnostics.length}  validation=${report.validationDiagnostics.length}`,
  )
  if (showDetails) {
    for (const diagnostic of report.conversionDiagnostics) console.log(`  C  ${diagnostic}`)
    for (const diagnostic of report.validationDiagnostics) console.log(`  V  ${diagnostic}`)
  }
}

if (shouldWrite) {
  console.log(`\nWrote ${reports.length} M3N files to ${path.relative(root, targetDirectory)}`)
}

if (selectedSlug) {
  const selected = reports.find((report) => report.slug === selectedSlug)
  if (!selected) throw new Error(`Unknown Happi123 score: ${selectedSlug}`)
  console.log(`\n--- ${selectedSlug}.m3n ---\n${selected.output}`)
  if (showMeasures) {
    const meter = /\{(\d+\/\d+)\}/.exec(selected.output)?.[1] ?? '4/4'
    const measures = selected.output
      .replace(/^[\s\S]*?\{\d+\/\d+\}/, '')
      .split(/(?::\|\|\||:\|\|:|:\|\||\|\|\||\|\|:|\|\||\|)/)
      .map((measure) => measure.trim())
      .filter((measure) => /[0-7]/.test(measure))
    console.log(`\n--- ${selectedSlug} measure diagnostics ---`)
    for (const [index, measure] of measures.entries()) {
      const diagnostics = validateM3N(`{${meter}}\n${measure} |`).filter((message) => message.includes('拍数'))
      if (diagnostics.length > 0) console.log(`${index + 1}: ${diagnostics.join('; ')}\n  ${measure}`)
    }
  }
}
