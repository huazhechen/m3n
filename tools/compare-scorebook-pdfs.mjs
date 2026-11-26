// Compare decoded operators and embedded fonts, ignoring PDF timestamps.
// Usage: node tools/compare-scorebook-pdfs.mjs before.pdf after.pdf [report.json]
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function inspect(path) {
  const pdf = await PDFDocument.load(await readFile(path))
  const pages = pdf.getPages().map(page => {
    const content = page.node.Contents()
    const streams = content instanceof PDFArray ? content.asArray() : [content]
    return streams.map(ref => hash(decodePDFRawStream(pdf.context.lookup(ref, PDFRawStream)).decode()))
  })
  const fonts = []
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue
    const font = object.lookupMaybe(PDFName.of('FontFile2'), PDFRawStream)
    if (font) fonts.push(hash(decodePDFRawStream(font).decode()))
  }
  return { pages, fonts: fonts.sort() }
}
const before = await inspect(process.argv[2]), after = await inspect(process.argv[3])
assert.deepEqual(after, before, 'Every PDF page operator and embedded font must remain identical')
const report = { pages: before.pages.length, fonts: before.fonts.length, identicalPageOperators: true, identicalEmbeddedFonts: true }
if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(report, null, 2) + '\n')
console.log(report)
