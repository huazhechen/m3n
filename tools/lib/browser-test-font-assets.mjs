import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'

/** Keep full font bytes out of the temporary library bundle and its JS parser. */
export function browserTestFontAssets(root) {
  const directory = join(root, 'packages/numbered-notation/src/font-assets')
  return {
    plugin: {
      name: 'browser-test-font-assets', enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/numbered-notation/')) return
        return code.replace(/new URL\(["']\.\/font-assets\/([^"']+)["'], import\.meta\.url\)\.href/g,
          (_, file) => JSON.stringify(`http://scorebook.local/font-assets/${file}`))
      },
    },
    async fulfill(route) {
      const pathname = new URL(route.request().url()).pathname
      if (!pathname.startsWith('/font-assets/')) return false
      const file = join(directory, basename(pathname))
      if (!existsSync(file)) throw new Error(`Missing test font: ${file}`)
      await route.fulfill({ path: file, contentType: file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf' })
      return true
    },
  }
}
