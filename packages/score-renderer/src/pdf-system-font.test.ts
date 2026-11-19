import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } from 'pdf-lib'
import { pdfUnicodeHex, registerSystemCjkFont, gb1Cid } from './pdf-system-font'

describe('unembedded system text font', () => {
  it('encodes BMP and supplementary characters as UTF-16BE without a BOM', () => {
    expect(pdfUnicodeHex('中文A')).toBe('4E2D65870041')
    expect(pdfUnicodeHex('𠮷')).toBe('D842DFB7')
  })

  it('references Adobe GB1 substitution and supplies Unicode mappings without a font file', async () => {
    const pdf = await PDFDocument.create()
    const system = registerSystemCjkFont(pdf, ['中', '文', '𠮷'])
    const font = pdf.context.lookup(system.ref, PDFDict)
    expect(font.lookup(PDFName.of('Encoding'))).toBeInstanceOf(PDFRawStream)
    expect(gb1Cid('中')).toBe(4559)
    expect(gb1Cid('文')).toBe(3795)
    expect(font.has(PDFName.of('ToUnicode'))).toBe(true)
    const descendants = font.lookup(PDFName.of('DescendantFonts'), PDFArray)
    const cid = descendants.lookup(0, PDFDict)
    const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict)
    for (const key of ['FontFile', 'FontFile2', 'FontFile3']) expect(descriptor.has(PDFName.of(key))).toBe(false)
    expect(system.encode('中').toString()).toBe('<4E2D>')
    expect(system.encode('𠮷').toString()).toBe('<D842DFB7>')
  })
})
