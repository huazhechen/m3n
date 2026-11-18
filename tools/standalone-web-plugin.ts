import type { Plugin } from 'vite'

/** Publish executable code with its HTML so an open tab never needs deleted chunks. */
export function standaloneWebPlugin(): Plugin {
  return {
    name: 'm3n-standalone-web',
    apply: 'build',
    enforce: 'post',
    config() {
      return {
        build: {
          cssCodeSplit: false,
          modulePreload: false,
          // AudioWorklet code must also survive a deployment before first playback.
          assetsInlineLimit: (filename: string) => filename.endsWith('.js') ? true : undefined,
          rolldownOptions: { output: { codeSplitting: false } },
        },
      }
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html']
        if (!html || html.type !== 'asset' || typeof html.source !== 'string') throw new Error('Missing application HTML')
        // Rolldown lists inlined deferred modules as dynamic imports of the entry itself.
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
        if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.some(file => file !== chunks[0].fileName)) {
          throw new Error(`Standalone application must contain exactly one script without external module imports: ${JSON.stringify(chunks.map(chunk => ({ file: chunk.fileName, imports: chunk.imports, dynamic: chunk.dynamicImports })))}`)
        }
        let embedded = false
        html.source = html.source.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (tag, src: string) => {
          if (!src.endsWith(`/${chunks[0].fileName}`)) return tag
          embedded = true
          return `<script type="module">${chunks[0].code.replace(/<\/script/gi, '<\\/script')}</script>`
        })
        if (!embedded) throw new Error('Application entry script was not embedded')
        for (const item of Object.values(bundle)) {
          if (item.type !== 'asset' || !item.fileName.endsWith('.css')) continue
          const css = String(item.source).replace(/<\/style/gi, '\\3c /style')
          let embeddedStyle = false
          html.source = html.source.replace(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g, (tag, href: string) => {
            if (!href.endsWith(`/${item.fileName}`)) return tag
            embeddedStyle = true
            return `<style>${css}</style>`
          })
          if (!embeddedStyle) throw new Error(`Stylesheet was not embedded: ${item.fileName}`)
          delete bundle[item.fileName]
        }
        delete bundle[chunks[0].fileName]
      },
    },
  }
}
