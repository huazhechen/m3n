import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { digest, historyFile } from './asset-history.mjs'

export const retentionMs = 72 * 60 * 60 * 1000

// Retirement starts when an asset first disappears from a published build.
export async function publishWeb(staging, destination, { now = Date.now() } = {}) {
  await mkdir(destination, { recursive: true })
  const statePath = `${destination}.asset-history.json`
  let retired = {}
  try { retired = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const list = async directory => {
    try { return (await readdir(directory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(directory.length + 1)) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  const current = new Set(await list(join(staging, 'assets')))
  // Assets first; replace mutable entry files only after every dependency exists.
  for (const entry of await readdir(staging)) {
    if (entry !== 'index.html' && entry !== 'score-catalog.json') await cp(join(staging, entry), join(destination, entry), { recursive: true, force: entry !== 'assets' })
  }
  for (const entry of ['score-catalog.json', 'index.html']) {
    try { await rename(join(staging, entry), join(destination, entry)) }
    catch (error) { if (error.code !== 'ENOENT' || entry === 'index.html') throw error }
  }
  for (const file of await list(join(destination, 'assets'))) {
    if (current.has(file)) { delete retired[file]; continue }
    retired[file] ??= now
    if (now - retired[file] >= retentionMs) {
      await rm(join(destination, 'assets', file))
      delete retired[file]
    }
  }
  const assets = await Promise.all((await list(join(destination, 'assets'))).sort().map(async file => {
    const bytes = await readFile(join(destination, 'assets', file))
    return { file: `assets/${file}`, sha256: digest(bytes), bytes: bytes.length, retiredAt: retired[file] ?? null }
  }))
  await writeFile(join(destination, `${historyFile}.tmp`), JSON.stringify({ version: 1, assets }))
  await rename(join(destination, `${historyFile}.tmp`), join(destination, historyFile))
  await writeFile(`${statePath}.tmp`, JSON.stringify(retired))
  await rename(`${statePath}.tmp`, statePath)
}
