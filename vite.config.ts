import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const execFileAsync = promisify(execFile)

function scoreIndexWatcher(): Plugin {
  let scoresDirectory = ''
  let projectRoot = ''
  let refresh = Promise.resolve()
  const isScoreSource = (file: string) => {
    const normalized = normalizePath(file)
    return normalized.startsWith(`${scoresDirectory}/`) && normalized.endsWith('.m3n')
  }

  return {
    name: 'm3n-score-index-watcher',
    configResolved(config) {
      projectRoot = config.root
      scoresDirectory = normalizePath(resolve(config.root, 'src/scores'))
    },
    configureServer(server) {
      server.watcher.add(scoresDirectory)
      const rebuild = (file: string) => {
        if (!isScoreSource(file)) return
        refresh = refresh.then(async () => {
          await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'generate:score-index'], { cwd: projectRoot })
          server.ws.send({ type: 'full-reload' })
        }).catch((error: unknown) => {
          server.config.logger.error(`Unable to regenerate the score index: ${String(error)}`)
        })
      }
      server.watcher.on('add', rebuild)
      server.watcher.on('change', rebuild)
      server.watcher.on('unlink', rebuild)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), scoreIndexWatcher()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/verovio/')) return 'verovio'
          if (id.includes('/node_modules/spessasynth_')) return 'spessasynth'
          return undefined
        },
      },
    },
  },
})
