// Small static server for Playwright's isolated production output. Keeping Vite
// out of the browser phase saves its compiler/configuration memory.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const root = resolve(argument('root') ?? '.tmp/playwright-dist'), port = Number(argument('port') ?? 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.m3n': 'text/plain; charset=utf-8' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let file = resolve(root, '.' + pathname)
    if (!file.startsWith(root + sep) && file !== root) { response.writeHead(403).end(); return }
    let info = await stat(file).catch(() => undefined)
    if (info?.isDirectory() || !info && !extname(pathname)) { file = resolve(root, 'index.html'); info = await stat(file) }
    if (!info?.isFile()) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).on('error', () => response.destroy()).pipe(response)
  } catch { response.writeHead(400).end() }
})
server.listen(port, '127.0.0.1')
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => { server.closeAllConnections(); server.close(() => process.exit(0)) })
