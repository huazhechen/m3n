import fontUrl from '../assets/builtin-pdf-text.ttf?url'

/** Only PDF exports request this asset; never installs a browser font. */
export async function loadBuiltinPdfFont(signal: AbortSignal) {
  signal.throwIfAborted()
  const response = await fetch(fontUrl, { signal })
  if (!response.ok) throw new Error('内置乐谱 PDF 字体加载失败，请重试。')
  const bytes = new Uint8Array(await response.arrayBuffer())
  signal.throwIfAborted()
  return bytes
}
