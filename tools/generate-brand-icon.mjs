import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/favicon.svg')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title desc">
  <title id="title">M3N</title>
  <desc id="desc">Three independent ascending notes on a musical staff</desc>
  <rect width="64" height="64" rx="16" fill="#174f54"/>
  <g stroke="#b8d3c9" stroke-width="1.6" stroke-linecap="round" opacity=".62">
    <path d="M12 21h40M12 28h40M12 35h40M12 42h40M12 49h40"/>
  </g>
  <g fill="#f5f6f0" stroke="#f5f6f0" stroke-width="2.75" stroke-linecap="round">
    <ellipse cx="20" cy="42" rx="4.4" ry="3.25" transform="rotate(-18 20 42)"/>
    <path d="M23.8 40.7V23" fill="none"/>
    <ellipse cx="32" cy="35" rx="4.4" ry="3.25" transform="rotate(-18 32 35)"/>
    <path d="M35.8 33.7V16" fill="none"/>
    <ellipse cx="44" cy="28" rx="4.4" ry="3.25" transform="rotate(-18 44 28)"/>
    <path d="M47.8 26.7V12" fill="none"/>
  </g>
  <circle cx="20" cy="42" r="1.2" fill="#e6b94e"/>
  <circle cx="32" cy="35" r="1.2" fill="#e6b94e"/>
  <circle cx="44" cy="28" r="1.2" fill="#e6b94e"/>
</svg>
`

await mkdir(dirname(output), { recursive: true })
await writeFile(output, svg, 'utf8')
console.log(`Generated ${output}`)
