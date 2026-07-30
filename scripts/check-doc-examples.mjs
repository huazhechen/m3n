import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const files = ['MANUAL.md', 'GUIDE.md']
const expectedDiagnosticCounts = new Map()
const server = await createServer({ server: { middlewareMode: true } })

try {
  const { validateM3N } = await server.ssrLoadModule('/src/lib/m3n-validate.ts')
  let failed = 0

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const examples = [...source.matchAll(/```m3n\s*\r?\n([\s\S]*?)```/g)].map((match) => match[1])

    for (const [index, example] of examples.entries()) {
      const diagnostics = validateM3N(example)
      const id = `${file}:${index + 1}`
      const expectedCount = expectedDiagnosticCounts.get(id) ?? 0
      if (diagnostics.length === expectedCount) continue

      failed += 1
      console.log(`${file} example ${index + 1}: expected ${expectedCount} diagnostics, received ${diagnostics.length}`)
      diagnostics.forEach((diagnostic) => console.log(`  ${diagnostic}`))
    }
  }

  if (failed > 0) {
    console.error(`Found diagnostics in ${failed} documentation examples.`)
    process.exitCode = 1
  }
} finally {
  await server.close()
}
