export type BundleAsset = { url: string; bytes: number }
export type LibraryBundles = { sources: BundleAsset; fonts: BundleAsset }
export type LibraryResourceProgress = { completed: number; total: number; installing: boolean }
export type LibraryResourceOptions = { sourcesOnly?: boolean; signal?: AbortSignal; onProgress?: (progress: LibraryResourceProgress) => void }

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    const { gunzipSync } = await import('fflate')
    return gunzipSync(data)
  }
  const stream = new Blob([Uint8Array.from(data)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Shared HTTP downloads survive a cancelled export; only that caller unsubscribes. */
export function createLibraryResources(bundles: LibraryBundles) {
  let sources: Record<string, string> | undefined
  let sourceRequest: Promise<void> | undefined, fontRequest: Promise<void> | undefined
  let sourceBytes = 0, fontBytes = 0, installing = false
  const listeners = new Set<(progress: LibraryResourceProgress) => void>()
  const snapshot = () => ({ completed: sourceBytes + fontBytes, total: bundles.sources.bytes + bundles.fonts.bytes, installing })
  const notify = () => { for (const listener of listeners) listener(snapshot()) }
  async function download(asset: BundleAsset, report: (bytes: number) => void) {
    const response = await fetch(asset.url)
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('乐谱与字体下载失败，请重试。')
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value); loaded += value.length
          report(Math.min(loaded, asset.bytes)); notify()
        }
      } finally { reader.releaseLock() }
    } else {
      const data = new Uint8Array(await response.arrayBuffer())
      chunks.push(data); loaded = data.length
    }
    if (loaded !== asset.bytes) throw new Error('资源包长度不一致，请刷新页面重试。')
    const bytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    report(loaded); notify()
    return inflate(bytes)
  }
  function start(sourcesOnly = false) {
    sourceRequest ??= (async () => {
      const data = await download(bundles.sources, bytes => { sourceBytes = bytes })
      const value: unknown = JSON.parse(new TextDecoder().decode(data))
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(source => typeof source === 'string')) {
        throw new Error('乐谱包格式无效，请刷新页面重试。')
      }
      sources = value as Record<string, string>
    })().catch(error => { sourceRequest = undefined; sourceBytes = 0; notify(); throw error })
    if (sourcesOnly) return sourceRequest
    fontRequest ??= (async () => {
      const data = await download(bundles.fonts, bytes => { fontBytes = bytes })
      if (data.length < 4) throw new Error('字体包格式无效。')
      const indexLength = new DataView(data.buffer, data.byteOffset).getUint32(0, true)
      if (indexLength > data.length - 4) throw new Error('字体包索引无效。')
      const entries = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + indexLength))) as Array<{
        file: string; characters: string; weight: number; style: string; offset: number; length: number
      }>
      const expected = new Set(['NotoSansSC-library.ttf', 'BarlowSemiCondensed-Medium.ttf', 'Bravura.ttf'])
      let offset = 0
      if (!Array.isArray(entries) || entries.length !== expected.size) throw new Error('字体包内容不完整。')
      const fonts = entries.map(entry => {
        if (!expected.delete(entry.file) || typeof entry.characters !== 'string' || entry.offset !== offset
          || !Number.isInteger(entry.length) || entry.length < 12 || offset + entry.length > data.length - 4 - indexLength) throw new Error('字体包内容无效。')
        offset += entry.length
        return { ...entry, url: '', data: data.slice(4 + indexLength + entry.offset, 4 + indexLength + offset) }
      })
      if (offset !== data.length - 4 - indexLength) throw new Error('字体包长度无效。')
      installing = true; notify()
      try {
        const { registerScoreFontBundle, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation/fonts')
        registerScoreFontBundle(fonts)
        await prepareNumberedNotationFonts(fonts.find(font => font.file === 'NotoSansSC-library.ttf')!.characters)
      } finally { installing = false; notify() }
    })().catch(error => { fontRequest = undefined; fontBytes = 0; notify(); throw error })
    return Promise.all([sourceRequest, fontRequest]).then(() => {})
  }
  async function prepare({ signal, onProgress, sourcesOnly = false }: LibraryResourceOptions = {}) {
    signal?.throwIfAborted()
    const report = onProgress ? (value: LibraryResourceProgress) => onProgress(sourcesOnly
      ? { completed: sourceBytes, total: bundles.sources.bytes, installing: false } : value) : undefined
    if (report) { listeners.add(report); report(snapshot()) }
    let abort: (() => void) | undefined
    try {
      await Promise.race([start(sourcesOnly), new Promise<never>((_, reject) => {
        abort = () => reject(signal!.reason)
        signal?.addEventListener('abort', abort, { once: true })
      })])
      signal?.throwIfAborted()
    } finally {
      if (report) listeners.delete(report)
      if (abort) signal?.removeEventListener('abort', abort)
    }
  }
  return {
    prepare,
    async source(path: string): Promise<string> {
      await prepare({ sourcesOnly: true })
      if (!sources || !Object.hasOwn(sources, path)) throw new Error('乐谱包缺少曲目，请刷新页面重试。')
      return sources[path]
    },
  }
}
