#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node tools/refresh-score-pdfs.mjs\n\nBuild the renderer, regenerate the complete scorebook, write preferred widths\nback to score sources, then refresh every solo PDF and proof PDF.\nUses config/scorebook/editorial-plan.json; stops at the first failed step.')
  process.exit(0)
}
if (args.length) {
  console.error(`Unknown arguments: ${args.join(' ')}. Use --help for usage.`)
  process.exit(1)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const steps = [
  ['Build renderer packages', npm, ['run', 'build:packages']],
  ['Generate and validate scorebook, then write preferred widths', process.execPath, ['tools/build-scorebook.mjs']],
  ['Generate and validate all solo PDFs and proof PDFs', process.execPath, ['tools/export-score-pdfs.mjs']],
]
for (const [index, [label, command, commandArgs]] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${label}`)
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    console.error(`PDF refresh stopped: ${label}${result.error ? ` (${result.error.message})` : result.signal ? ` (${result.signal})` : ''}`)
    process.exit(result.status || 1)
  }
}
console.log('\nPDF refresh complete. All PDFs are in scorebook/; preferred widths are saved in src/scores/.')
