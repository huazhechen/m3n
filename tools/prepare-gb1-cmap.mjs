// Regenerate the encoding-only table from Adobe's UniGB-UTF16-H CMap.
// Source and license: public/licenses/adobe-cmap/README.txt.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

if (process.argv.length !== 3) throw new Error('Usage: node tools/prepare-gb1-cmap.mjs /path/to/UniGB-UTF16-H')
const source = readFileSync(process.argv[2], 'utf8')
if (!source.trimEnd().endsWith('%%EOF')) throw new Error('Incomplete CMap source')
const ranges = []
for (const [kind, regex] of [['char', /<([\da-f]+)>\s+(\d+)/gi], ['range', /<([\da-f]+)>\s+<([\da-f]+)>\s+(\d+)/gi]]) {
  const blocks = new RegExp(`\\d+ begincid${kind}\\n([\\s\\S]*?)endcid${kind}`, 'g')
  for (const block of source.matchAll(blocks)) {
    for (const item of block[1].matchAll(regex)) {
      ranges.push(kind === 'char' ? [parseInt(item[1], 16), parseInt(item[1], 16), Number(item[2])]
        : [parseInt(item[1], 16), parseInt(item[2], 16), Number(item[3])])
    }
  }
}
ranges.sort((a, b) => a[0] - b[0])
if (!ranges.length || ranges.some((range, i) => range[0] > range[1] || i && range[0] <= ranges[i - 1][1])) throw new Error('Invalid or overlapping CMap ranges')
writeFileSync(fileURLToPath(new URL('../packages/score-renderer/src/gb1-cmap.json', import.meta.url)), JSON.stringify(ranges) + '\n')
