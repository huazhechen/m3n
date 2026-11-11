import dns from 'node:dns'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

dns.setDefaultResultOrder('ipv4first')

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const snapshotDate = new Date().toISOString().slice(0, 10)

const sources = [
  {
    name: 'Verovio Reference Book',
    version: '6.2',
    seeds: ['https://book.verovio.org/'],
    output: resolve(root, 'docs/VEROVIO_AGENT_REFERENCE.md'),
    minimumPages: 40,
    accepts: (url) => url.origin === 'https://book.verovio.org'
      && !url.pathname.startsWith('/assets/')
      && !url.pathname.startsWith('/images/')
      && url.pathname !== '/search.html'
      && (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')),
    extract: extractVerovioContent,
    group: verovioGroup,
    searchTerms: [
      'VerovioToolkit', 'loadData', 'setOptions', 'renderToSVG', 'renderToMIDI',
      'renderToTimemap', 'getElementsAtTime', 'getTimeForElement', 'getMEI',
      'MEI supported elements', 'Toolkit methods', 'Toolkit options',
    ],
    scope: [
      'Installation and JavaScript/WebAssembly integration',
      'Rendering, layout, SVG interaction, MIDI, timemaps, selection, editing, and transposition',
      'Every documented input/output format, Toolkit method, Toolkit option, and MEI support table',
      'Tutorials, advanced topics, troubleshooting, licensing, and contributor material',
    ],
  },
  {
    name: 'MEI Guidelines',
    version: '5.1',
    seeds: [
      'https://music-encoding.org/guidelines/v5/content/index.html',
      'https://music-encoding.org/guidelines/v5/elements.html',
      'https://music-encoding.org/guidelines/v5/attribute-classes.html',
      'https://music-encoding.org/guidelines/v5/model-classes.html',
      'https://music-encoding.org/guidelines/v5/macro-groups.html',
      'https://music-encoding.org/guidelines/v5/data-types.html',
      'https://music-encoding.org/guidelines/v5/modules.html',
    ],
    output: resolve(root, 'docs/MEI_AGENT_REFERENCE.md'),
    minimumPages: 1500,
    accepts: (url) => url.origin === 'https://music-encoding.org'
      && /^\/guidelines\/v5\/(?:content\/[^/]+\.html|elements(?:\.html|\/[^/]+\.html)|attribute-classes(?:\.html|\/[^/]+\.html)|model-classes(?:\.html|\/[^/]+\.html)|macro-groups(?:\.html|\/[^/]+\.html)|data-types(?:\.html|\/[^/]+\.html)|modules(?:\.html|\/[^/]+\.html))$/.test(url.pathname),
    extract: extractMeiContent,
    group: meiGroup,
    searchTerms: [
      'meiHead', 'scoreDef', 'staffDef', 'measure', 'layer', 'note', 'rest',
      'chord', 'tuplet', 'controlevent', 'xml:id', 'att.duration', 'data.DURATION',
      'model.eventLike', 'MEI.shared',
    ],
    scope: [
      'All prose Guidelines chapters',
      'Every element specification and its content model',
      'Every attribute class, model class, macro group, data type, and module specification',
      'Schema-oriented inheritance, membership, constraints, examples, and chapter cross-references',
    ],
  },
]

function normalizeUrl(value, base) {
  try {
    const url = new URL(value, base)
    url.hash = ''
    url.search = ''
    if (url.pathname !== '/' && url.pathname.endsWith('/index.html')) {
      // Keep explicit index URLs because they are canonical pages in the MEI site.
    }
    return url
  } catch {
    return null
  }
}

function linksIn(html, pageUrl, accepts) {
  const urls = []
  for (const match of html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const url = normalizeUrl(decodeEntities(match[2]), pageUrl)
    if (url && accepts(url)) urls.push(url.href)
  }
  return urls
}

function pageTitle(html, fallback) {
  const heading = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(html)?.[1]
  const title = heading ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  return cleanInline(title ?? fallback)
}

function extractVerovioContent(html) {
  const marker = '<div class="col-md-9" id="content">'
  const start = html.indexOf(marker)
  if (start < 0) return extractBody(html)
  const footer = html.indexOf('<footer', start)
  return html.slice(start + marker.length, footer < 0 ? html.length : footer)
    .replace(/<a\b[^>]*class=["'][^"']*hidden-print[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
}

function extractMeiContent(html) {
  const start = html.search(/<section\b[^>]*class=["'][^"']*specPage[^"']*["'][^>]*>/i)
  if (start < 0) return extractBody(html)
  const sidebar = html.indexOf('<div class="column col-4', start)
  const footer = html.indexOf('<footer', start)
  const candidates = [sidebar, footer, html.length].filter((value) => value >= 0)
  return html.slice(start, Math.min(...candidates))
}

function extractBody(html) {
  return /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html
}

const entities = {
  amp: '&', apos: "'", copy: '(c)', deg: 'deg', gt: '>', hellip: '...', laquo: '<<',
  ldquo: '"', lsquo: "'", lt: '<', mdash: '--', middot: '*', nbsp: ' ', ndash: '-',
  quot: '"', raquo: '>>', rdquo: '"', reg: '(R)', rsquo: "'", times: 'x',
}

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole, entity) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10
      const digits = radix === 16 ? entity.slice(2) : entity.slice(1)
      const point = Number.parseInt(digits, radix)
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole
    }
    return entities[entity.toLowerCase()] ?? whole
  })
}

function stripTags(value) {
  return value.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '')
}

function cleanInline(value) {
  return decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim()
}

function preserveAngleText(value) {
  return /^<\/?[A-Za-z][^<>]*>$/.test(value)
    ? value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    : value
}

function normalizeCode(value) {
  const lines = decodeEntities(stripTags(value)).replaceAll('\r', '').split('\n')
  while (lines[0]?.trim() === '') lines.shift()
  while (lines.at(-1)?.trim() === '') lines.pop()
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)?.[0].length ?? 0)
  const indent = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(indent).replace(/\s+$/g, '')).join('\n')
}

function languageFor(preTag) {
  const value = /(?:language-|highlight\s+)([a-z0-9_+-]+)/i.exec(preTag)?.[1]?.toLowerCase()
  if (!value || value === 'plaintext' || value === 'rouge') return 'text'
  return value === 'js' ? 'javascript' : value
}

function tableToMarkdown(table) {
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((cell) => cleanInline(cell[1]).replaceAll('|', '\\|')))
    .filter((row) => row.length > 0)
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => [...row, ...Array(width - row.length).fill('')])
  return [
    `| ${normalized[0].join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function htmlToMarkdown(input, pageUrl) {
  let html = input
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')

  const blocks = []
  const protect = (content) => {
    const token = `@@OFFLINE_BLOCK_${blocks.length}@@`
    blocks.push(content)
    return `\n\n${token}\n\n`
  }

  html = html.replace(/(<div\b[^>]*class=["']\s*pre\s+code(?:\s+[^"']*)?["'][^>]*>)\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/div>/gi, (_, tag, body) => {
    const code = normalizeCode(body)
    const language = /egxml/i.test(tag) ? 'xml' : languageFor(tag)
    const fence = code.includes('```') ? '````' : '```'
    return protect(`${fence}${language}\n${code}\n${fence}`)
  })
  html = html.replace(/(<pre\b[^>]*>)([\s\S]*?)<\/pre>/gi, (_, tag, body) => {
    const code = normalizeCode(body)
    const fence = code.includes('```') ? '````' : '```'
    return protect(`${fence}${languageFor(tag)}\n${code}\n${fence}`)
  })
  html = html.replace(/<code\b[^>]*>([^<]*\n[\s\S]*?)<\/code>/gi, (_, body) => {
    const code = normalizeCode(body)
    const fence = code.includes('```') ? '````' : '```'
    return protect(`${fence}xml\n${code}\n${fence}`)
  })
  html = html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => protect(tableToMarkdown(table)))

  html = html
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => cleanInline(alt) ? `[Image: ${cleanInline(alt)}]` : '')
    .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
      const label = cleanInline(body)
      if (!label) return ''
      try {
        return `[${label}](${new URL(decodeEntities(href), pageUrl).href})`
      } catch {
        return label
      }
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => `\n\n${'#'.repeat(Math.min(6, Number(level) + 2))} ${preserveAngleText(cleanInline(body))}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, body) => `\`${cleanInline(body).replaceAll('`', '\\`')}\``)
    .replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi, (_, body) => `\n\n**${cleanInline(body)}**\n`)
    .replace(/<dd\b[^>]*>([\s\S]*?)<\/dd>/gi, '$1\n')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `\n- ${body.trim()}\n`)
    .replace(/<aside\b[^>]*class=["'][^"']*warning[^"']*["'][^>]*>/gi, '\n\n> WARNING: ')
    .replace(/<aside\b[^>]*>/gi, '\n\n> ')
    .replace(/<\/(?:aside|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<\/(?:p|div|section|article|figure|figcaption|ul|ol|dl)>/gi, '\n\n')
    .replace(/<(?:p|div|section|article|figure|figcaption|ul|ol|dl)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')

  let markdown = decodeEntities(html)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<\/?[A-Za-z][A-Za-z0-9_.:-]*(?:\s+[^<>\n]*)?>/g, (tag) => `\`${tag}\``)
    .trim()
  blocks.forEach((block, index) => {
    markdown = markdown.replace(`@@OFFLINE_BLOCK_${index}@@`, block)
  })
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function markdownTitle(value) {
  return /^<\/?[A-Za-z][^<>]*>$/.test(value) ? `\`${value}\`` : value
}

function slug(value) {
  return value.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function verovioGroup(url) {
  const path = new URL(url).pathname
  if (path === '/') return 'Overview'
  if (path.startsWith('/first-steps/')) return 'Tutorial: First Steps'
  if (path.startsWith('/interactive-notation/')) return 'Tutorial: Interactive Notation'
  if (path.startsWith('/advanced-topics/')) return 'Advanced Topics'
  if (path.startsWith('/toolkit-reference/')) return 'Toolkit Reference'
  if (path.startsWith('/installing-or-building-from-sources/')) return 'Installation and Bindings'
  if (path.startsWith('/contributing/')) return 'Contributing'
  if (path.startsWith('/tutorials/')) return 'Runnable Tutorials'
  return 'Other Official Pages'
}

function meiGroup(url) {
  const path = new URL(url).pathname
  if (path.includes('/content/')) return 'Guidelines Chapters'
  if (path.includes('/elements')) return 'Element Specifications'
  if (path.includes('/attribute-classes')) return 'Attribute Classes'
  if (path.includes('/model-classes')) return 'Model Classes'
  if (path.includes('/macro-groups')) return 'Macro Groups'
  if (path.includes('/data-types')) return 'Data Types'
  if (path.includes('/modules')) return 'Modules'
  return 'Other Specifications'
}

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'm3n-offline-doc-builder/1.0' },
        signal: AbortSignal.timeout(45000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 4) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500))
    }
  }
  throw lastError
}

async function crawl(source) {
  const visited = new Set()
  const pending = [...source.seeds]
  const pages = new Map()
  const failures = []

  while (pending.length > 0) {
    const batch = []
    while (pending.length > 0 && batch.length < 20) {
      const url = pending.shift()
      if (url && !visited.has(url)) {
        visited.add(url)
        batch.push(url)
      }
    }
    if (batch.length === 0) continue
    const results = await Promise.all(batch.map(async (url) => {
      try {
        return { url, html: await fetchWithRetry(url) }
      } catch (error) {
        failures.push({ url, error: error instanceof Error ? error.message : String(error) })
        return null
      }
    }))
    for (const result of results) {
      if (!result) continue
      pages.set(result.url, result.html)
      for (const link of linksIn(result.html, result.url, source.accepts)) {
        if (!visited.has(link) && !pending.includes(link)) pending.push(link)
      }
    }
    process.stdout.write(`\r${source.name}: ${pages.size} pages fetched, ${pending.length} queued`)
  }
  process.stdout.write('\n')
  if (failures.length > 0) {
    const details = failures.map(({ url, error }) => `${url}: ${error}`).join('\n')
    throw new Error(`${source.name}: incomplete snapshot (${failures.length} failures)\n${details}`)
  }
  if (pages.size < source.minimumPages) {
    throw new Error(`${source.name}: found only ${pages.size} pages; expected at least ${source.minimumPages}`)
  }
  return pages
}

function renderManual(source, pages) {
  const records = [...pages.entries()].map(([url, html]) => ({
    url,
    title: markdownTitle(pageTitle(source.extract(html), url)),
    group: source.group(url),
    anchor: `offline-${slug(url)}`,
    body: htmlToMarkdown(source.extract(html), url),
  })).sort((left, right) => {
    const group = left.group.localeCompare(right.group)
    return group || left.url.localeCompare(right.url)
  })

  const groups = new Map()
  for (const record of records) {
    const items = groups.get(record.group) ?? []
    items.push(record)
    groups.set(record.group, items)
  }
  const index = [...groups.entries()].map(([group, items]) => [
    `### ${group}`,
    ...items.map(({ title, anchor, url }) => `- [${title}](#${anchor}) - \`${new URL(url).pathname}\``),
  ].join('\n')).join('\n\n')

  const sections = records.map(({ title, anchor, url, body }) => [
    '---',
    '',
    `<a id="${anchor}"></a>`,
    '',
    `## ${title}`,
    '',
    `Official source: <${url}>`,
    '',
    body,
  ].join('\n')).join('\n\n')

  return [
    `# ${source.name} ${source.version} - Complete Offline Agent Reference`,
    '',
    '## Snapshot Contract',
    '',
    `This is a normalized, searchable snapshot of the official ${source.name} documentation. It was generated on ${snapshotDate} from ${pages.size} official pages. The page bodies are preserved in source order, while site navigation, scripts, styling, and repeated chrome are removed.`,
    '',
    'This file is deliberately comprehensive. Treat normative statements, content models, value constraints, defaults, warnings, and examples below as the authority represented by this snapshot. Follow each section\'s `Official source` line only when refreshing the snapshot; ordinary development should not require network access.',
    '',
    'Coverage:',
    '',
    ...source.scope.map((item) => `- ${item}`),
    '',
    `High-value search terms: ${source.searchTerms.map((term) => `\`${term}\``).join(', ')}.`,
    '',
    '## How Agents Should Use This File',
    '',
    '1. Search the exact element, attribute, class, method, option, or format name first.',
    '2. Read the containing reference section, including inherited classes, parameter tables, warnings, and examples.',
    '3. For cross-references, search the target name in this file; links retain their official URLs for provenance but all crawled official content is included below.',
    '4. Distinguish a schema/API capability from application-specific support. This manual describes the official standard or library only.',
    '5. When upgrading versions, regenerate the file and review semantic changes rather than mixing facts from different releases.',
    '',
    '## Offline Page Index',
    '',
    index,
    '',
    sections,
    '',
  ].join('\n')
}

const requestedSources = process.argv.slice(2).map((value) => value.toLowerCase())

for (const source of sources) {
  if (requestedSources.length > 0
    && !requestedSources.some((value) => source.name.toLowerCase().includes(value))) continue
  const pages = await crawl(source)
  const content = renderManual(source, pages)
  await writeFile(source.output, content, 'utf8')
  console.log(`${source.name}: wrote ${pages.size} pages to ${source.output}`)
}
