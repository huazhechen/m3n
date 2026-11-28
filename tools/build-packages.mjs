import ts from 'typescript'
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// One compiler host retains parsed library files across these serial builds.
// Force every project to emit so verification never depends on a prior build.
const started = performance.now()
const projects = ['notation', 'numbered-notation', 'score-renderer'].map(name =>
  fileURLToPath(new URL(`../packages/${name}/tsconfig.json`, import.meta.url)))
const host = ts.createSolutionBuilderHost(ts.sys, undefined, ts.createDiagnosticReporter(ts.sys, true))
const status = ts.createSolutionBuilder(host, projects, { force: true }).build()
if (status !== 0) process.exit(status)
cpSync(new URL('../packages/numbered-notation/src/font-assets/', import.meta.url),
  new URL('../packages/numbered-notation/dist/font-assets/', import.meta.url), { recursive: true })
console.log(`Built all packages in ${((performance.now() - started) / 1000).toFixed(2)}s`)
