import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const historyFile = 'asset-history.json'
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function restoreWebHistory(destination, previousUrl, { now = Date.now(), retentionMs, staging, fetchImpl = fetch } = {}) {
  const base = new URL(previousUrl.endsWith('/') ? previousUrl : previousUrl + '/')
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Previous deployment URL must use HTTP(S).')
  const response = await fetchImpl(new URL(historyFile, base), { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (response.status === 404 || response.ok && response.headers.get('content-type')?.includes('text/html')) {
    console.log('Previous deployment has no asset history; this publication will start recording it.')
    return
  }
  if (!response.ok) throw new Error(`Cannot restore previous deployment history: HTTP ${response.status}`)
  const history = await response.json()
  if (history.version !== 1 || !Array.isArray(history.assets)) throw new Error('Invalid deployment asset history.')
  const candidates = history.assets.filter(entry => {
    if (typeof entry.file !== 'string' || !entry.file.startsWith('assets/') || entry.file.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#%]/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.retiredAt !== null && (!Number.isFinite(entry.retiredAt) || entry.retiredAt < 0)) throw new Error('Invalid deployment asset entry.')
    return entry.retiredAt === null || now - entry.retiredAt < retentionMs
  })
  const statePath = `${destination}.asset-history.json`
  let retired = {}
  try { retired = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  let index = 0
  await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
    while (index < candidates.length) {
      const entry = candidates[index++]
      const file = join(destination, entry.file)
      let bytes
      try { bytes = await readFile(staging ? join(staging, entry.file) : file) } catch (error) { if (error.code !== 'ENOENT') throw error }
      if (!bytes && staging) {
        try { bytes = await readFile(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      if (!bytes || digest(bytes) !== entry.sha256) {
        const asset = await fetchImpl(new URL(entry.file, base), { signal: AbortSignal.timeout(60_000) })
        if (!asset.ok) throw new Error(`Cannot restore ${entry.file}: HTTP ${asset.status}`)
        bytes = Buffer.from(await asset.arrayBuffer())
        if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Previous asset checksum mismatch: ${entry.file}`)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, bytes)
      }
      const key = entry.file.slice('assets/'.length)
      if (entry.retiredAt === null) delete retired[key]
      else retired[key] = entry.retiredAt
    }
  }))
  await mkdir(destination, { recursive: true })
  await writeFile(statePath, JSON.stringify(retired))
  console.log(`Restored ${candidates.length} previous deployment assets for the 72-hour retention window.`)
}
