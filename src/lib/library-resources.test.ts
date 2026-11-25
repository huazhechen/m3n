import { gzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { createLibraryResources } from './library-resources'

const fonts = vi.hoisted(() => ({ register: vi.fn(), prepare: vi.fn() }))
vi.mock('@m3n/numbered-notation/fonts', () => ({ registerScoreFontBundle: fonts.register, prepareNumberedNotationFonts: fonts.prepare }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

function fixture() {
  const entries = ['NotoSansSC-library.ttf', 'BarlowSemiCondensed-Medium.ttf', 'Bravura.ttf']
    .map((file, index) => ({ file, characters: '中文', weight: 400, style: 'normal', offset: index * 12, length: 12 }))
  const index = Buffer.from(JSON.stringify(entries)), size = Buffer.alloc(4)
  size.writeUInt32LE(index.length)
  const source = gzipSync(JSON.stringify({ 'one.m3n': 'first source', 'two.m3n': 'second source' }))
  const font = gzipSync(Buffer.concat([size, index, Buffer.alloc(36)]))
  const descriptors = { sources: { url: '/score/scores.gz', bytes: source.length }, fonts: { url: '/score/fonts.gz', bytes: font.length } }
  return { source, font, descriptors }
}

it('downloads both packages concurrently once, reports bytes and reuses all TTF bytes and sources', async () => {
  const { source, font, descriptors } = fixture()
  const requested: string[] = []
  let finishSources!: () => void
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requested.push(url)
    if (url === descriptors.sources.url) await new Promise<void>(resolve => { finishSources = resolve })
    return new Response(Uint8Array.from(url === descriptors.sources.url ? source : font))
  }))
  const library = createLibraryResources(descriptors), progress = vi.fn()
  const first = library.prepare({ onProgress: progress })
  expect(requested).toEqual(['/score/scores.gz', '/score/fonts.gz'])
  const second = library.prepare()
  finishSources()
  await Promise.all([first, second])
  expect(await library.source('two.m3n')).toBe('second source')
  await library.prepare()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fonts.register).toHaveBeenCalledOnce()
  expect(fonts.register.mock.calls[0][0].map((font: { data: Uint8Array }) => font.data.length)).toEqual([12, 12, 12])
  expect(progress).toHaveBeenLastCalledWith({ completed: source.length + font.length, total: source.length + font.length, installing: false })
  expect(progress.mock.calls.some(([p]) => p.installing)).toBe(true)
})

it('cancels only the waiting export while a reader keeps the shared downloads', async () => {
  const { source, font, descriptors } = fixture()
  let finish!: () => void
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === descriptors.sources.url) await new Promise<void>(resolve => { finish = resolve })
    return new Response(Uint8Array.from(url === descriptors.sources.url ? source : font))
  }))
  const library = createLibraryResources(descriptors), controller = new AbortController(), progress = vi.fn()
  const cancelled = library.prepare({ signal: controller.signal, onProgress: progress })
  const reader = library.source('one.m3n')
  controller.abort()
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
  const before = progress.mock.calls.length
  finish()
  expect(await reader).toBe('first source')
  expect(progress).toHaveBeenCalledTimes(before)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('retries a failed font request while preserving successfully decoded sources', async () => {
  const { source, font, descriptors } = fixture()
  let fontAttempts = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === descriptors.sources.url
    ? new Response(Uint8Array.from(source))
    : ++fontAttempts === 1 ? new Response('failed', { status: 503 }) : new Response(Uint8Array.from(font))))
  const library = createLibraryResources(descriptors)
  await expect(library.prepare()).rejects.toThrow('下载失败')
  expect(await library.source('one.m3n')).toBe('first source')
  expect(fetch).toHaveBeenCalledTimes(3)
  await expect(library.source('missing.m3n')).rejects.toThrow('缺少曲目')
})

it('rejects a truncated package before registering any fonts', async () => {
  const { source, font, descriptors } = fixture()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(Uint8Array.from(url === descriptors.sources.url ? source : font.subarray(0, -1)))))
  await expect(createLibraryResources(descriptors).prepare()).rejects.toThrow('长度不一致')
  expect(fonts.register).not.toHaveBeenCalled()
})
