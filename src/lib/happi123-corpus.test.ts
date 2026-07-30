import { describe, expect, it } from 'vitest'
import { happi123ToM3N } from './happi123-m3n'

const sourceModules = import.meta.glob('../scores/happi123/*.h123', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('Happi123 score corpus', () => {
  it('converts every source into structurally valid M3N', () => {
    expect(Object.keys(sourceModules)).toHaveLength(84)
    const failures: string[] = []

    for (const [path, source] of Object.entries(sourceModules)) {
      const slug = path.split('/').at(-1)?.replace(/\.h123$/, '') ?? path
      const result = happi123ToM3N(source)
      if (!/^\{title=[^}]+\}/.test(result.output)) failures.push(`${slug}: title`)
      if (!/\{key=[A-G](?:#|b)?\} \{\d+\/\d+\}/.test(result.output)) failures.push(`${slug}: settings`)
      if (/\{\d+_\d+\}|\{part=\||\{lyric\}|\{tet=/.test(result.output)) failures.push(`${slug}: malformed legacy output`)

      const musicLineCount = source
        .replace(/\{lyric\}[\s\S]*?\{\/lyric\}/g, '')
        .split(/\r?\n/)
        .filter((line) => /[0-7|]/.test(line.replace(/\{[^}]*\}/g, ''))).length
      if (musicLineCount > 1 && !result.output.includes('{br}')) failures.push(`${slug}: line breaks`)
    }

    expect(failures).toEqual([])
  })
})
