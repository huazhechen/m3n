/** Longest alternatives precede their prefixes (maj7 before m, III before I). */
const romanRoot = 'VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i'
const quality = 'maj7|maj9|sus2|sus4|dim|aug|m(?:aj[79]|1[0-3]|[2-9])?|1[0-3]|[2-9]'
export const harmonySymbolSource = `(?:N\\.C\\.|(?:${romanRoot}|[A-G][#b]?)(?:${quality})?(?:/[A-G][#b]?)?)`
const harmonyPattern = new RegExp(`^${harmonySymbolSource}$`)
const rootPattern = new RegExp(`^(${romanRoot}|[A-G][#b]?)(${quality})?(?:/([A-G][#b]?))?$`)

export function parseHarmonySymbol(value: string) {
  if (!harmonyPattern.test(value)) return null
  if (value === 'N.C.') return { root: '', quality: '', bass: '', roman: false }
  const match = rootPattern.exec(value)
  if (!match) return null
  const root = match[1] ?? ''
  return { root, quality: match[2] ?? '', bass: match[3] ?? '', roman: /^[ivIV]+$/.test(root) }
}

export function harmonyTokens(flags = 'g') {
  return new RegExp(`\\s+|\\(|\\)|~|${harmonySymbolSource}`, flags)
}
