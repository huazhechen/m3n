import { build } from 'vite'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { prepareBuiltinPdfFont } from './prepare-builtin-pdf-font.mjs'
import { restoreWebHistory } from './asset-history.mjs'
import { retentionMs, publishWeb } from './publish-web.mjs'

prepareBuiltinPdfFont({ check: true })
const previousDeployUrl = process.env.M3N_PREVIOUS_DEPLOY_URL
  ?? (process.env.CF_PAGES === '1' ? 'https://score.cheesefans.com/' : undefined)
const { values } = parseArgs({ options: { outDir: { type: 'string' }, base: { type: 'string' } } })
if (values.outDir) {
  await build({ ...(values.base ? { base: values.base } : {}), build: { outDir: values.outDir } })
} else {
  await mkdir('.tmp', { recursive: true })
  const staging = await mkdtemp(resolve('.tmp/web-build-'))
  try {
    await build({ ...(values.base ? { base: values.base } : {}), build: { outDir: staging, emptyOutDir: true } })
    if (previousDeployUrl) {
      await restoreWebHistory(resolve('dist'), previousDeployUrl, { retentionMs, staging })
    }
    await publishWeb(staging, resolve('dist'))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
