import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const python = process.env.M3N_FONT_PYTHON
  || (existsSync('.tmp/font-subset-env/bin/python') ? resolve('.tmp/font-subset-env/bin/python') : 'python3')
execFileSync(python, ['tools/prepare-library-fonts.py', ...process.argv.slice(2)], { stdio: 'inherit' })
