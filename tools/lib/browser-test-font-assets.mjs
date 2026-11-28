import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'

/** Keep full font bytes out of the temporary library bundle and its JS parser. */
export function browserTestFontAssets(root, fixtureFont, { origin = 'http://scorebook.local', allowFullCjk = false } = {}) {
  const directory = join(root, 'packages/numbered-notation/src/font-assets')
  return {
    plugin: {
      name: 'browser-test-font-assets', enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/numbered-notation/')) return
        let transformed = code.replace(/new URL\(["']\.\/font-assets\/([^"']+)["'], import\.meta\.url\)\.href/g,
          (_, file) => JSON.stringify(`${origin}/font-assets/${file}`))
        if (fixtureFont && /\/font-resources\.[jt]s$/.test(id)) transformed += `\nCJK_FONTS.push(${JSON.stringify({
          file: 'fixture-font.ttf', characters: fixtureFont.characters, bytes: fixtureFont.bytes,
          url: `${origin}/font-assets/fixture-font.ttf`, webUrl: `${origin}/font-assets/fixture-font.ttf`,
        })});`
        return transformed
      },
    },
    async prepareBookFont(page) {
      await page.evaluate(async origin => {
        const face = new FontFace('Noto Sans SC', `url("${origin}/font-assets/book-font.ttf")`)
        await face.load()
        document.fonts.add(face)
        await window.scorebook.prepare()
      }, origin)
    },
    async fulfill(route) {
      const pathname = new URL(route.request().url()).pathname
      if (!pathname.startsWith('/font-assets/')) return false
      if (!allowFullCjk && basename(pathname) === 'NotoSansSC-full.ttf') {
        await route.abort()
        throw new Error('Browser regressions must use score or fixture subsets, not the full CJK font')
      }
      const file = basename(pathname) === 'fixture-font.ttf' ? fixtureFont.fontFile
        : basename(pathname) === 'book-font.ttf' ? join(root, 'tools/fonts/library/NotoSansSC-library.ttf') : join(directory, basename(pathname))
      if (!existsSync(file)) throw new Error(`Missing test font: ${file}`)
      await route.fulfill({ path: file, contentType: file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf' })
      return true
    },
  }
}
