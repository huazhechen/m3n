import { execFileSync } from 'node:child_process'
import { existsSync, chmodSync } from 'node:fs'
if (existsSync('.git')) {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'])
  chmodSync('.githooks/pre-commit', 0o755)
}
