import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import ranges from './gb1-cmap.json'

/** UTF-16BE character codes for the predefined Adobe GB1 Unicode CMap. */
export function pdfUnicodeHex(text: string) {
  return Array.from({ length: text.length }, (_, i) => text.charCodeAt(i).toString(16).padStart(4, '0')).join('').toUpperCase()
}

/** Adobe's encoding metadata contains no glyphs or font program. */
export function gb1Cid(char: string) {
  const code = Number.parseInt(pdfUnicodeHex(char), 16)
  let low = 0, high = ranges.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const [first, last, cid] = ranges[mid]!
    if (code < first!) high = mid - 1
    else if (code > last!) low = mid + 1
    else return cid! + code - first!
  }
  return 0 // The viewer's missing-glyph handling applies to unmapped characters.
}

/** References a CJK substitute font; intentionally contains no font program. */
export function registerSystemCjkFont(pdf: PDFDocument, characters: Iterable<string>) {
  const context = pdf.context
  const descriptor = context.register(context.obj({
    Type: 'FontDescriptor', FontName: 'STSong-Light', Flags: 6,
    FontBBox: [-250, -250, 1200, 1000], ItalicAngle: 0,
    Ascent: 880, Descent: -120, CapHeight: 700, StemV: 80,
  }))
  const descendant = context.register(context.obj({
    Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light',
    CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 6 },
    FontDescriptor: descriptor, DW: 1000,
  }))
  const chars = [...new Set(characters)]
  const codes = chars.map(char => pdfUnicodeHex(char))
  const mappings: string[] = []
  for (let i = 0; i < codes.length; i += 100) {
    const group = codes.slice(i, i + 100)
    mappings.push(`${group.length} beginbfchar\n${group.map(code => `<${code}> <${code}>`).join('\n')}\nendbfchar`)
  }
  const unicode = context.register(context.flateStream(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /M3N-Unicode def\n/CMapType 2 def\n3 begincodespacerange\n<0000> <D7FF>\n<E000> <FFFF>\n<D800DC00> <DBFFDFFF>\nendcodespacerange\n${mappings.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`))
  const cidMappings: string[] = []
  for (let i = 0; i < chars.length; i += 100) {
    const group = chars.slice(i, i + 100)
    cidMappings.push(`${group.length} begincidchar\n${group.map(char => `<${pdfUnicodeHex(char)}> ${gb1Cid(char)}`).join('\n')}\nendcidchar`)
  }
  const encoding = context.register(context.flateStream(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 6 >> def\n/CMapName /M3N-GB1 def\n/CMapType 1 def\n/WMode 0 def\n3 begincodespacerange\n<0000> <D7FF>\n<E000> <FFFF>\n<D800DC00> <DBFFDFFF>\nendcodespacerange\n${cidMappings.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`, { Type: 'CMap', CMapName: 'M3N-GB1', CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 6 }, WMode: 0 }))
  const ref = context.register(context.obj({
    Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light', Encoding: encoding,
    DescendantFonts: [descendant], ToUnicode: unicode,
  }))
  return { ref, name: PDFName.of('M3NSystemText'), encode: (char: string) => PDFHexString.of(pdfUnicodeHex(char)) }
}
