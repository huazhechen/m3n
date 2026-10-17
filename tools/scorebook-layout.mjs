import { parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore, prepareNumberedNotationFonts } from '@m3n/numbered-notation'
import { outlineSvgText } from '../src/lib/vector-export'

export async function prepare(fontBase64) {
  const font = new FontFace('Scorebook Text', `url(data:font/otf;base64,${fontBase64})`, {ascentOverride:"88%",descentOverride:"12%",lineGapOverride:"0%"})
  await font.load()
  document.fonts.add(font)
  // Layout and final outlines must use the same CJK metrics on every machine.
  const style = document.createElement('style')
  style.textContent = 'svg text[font-family="serif"]{font-family:"Scorebook Text",serif} body{font-family:"Scorebook Text",serif}'
  document.head.append(style)
  await prepareNumberedNotationFonts()
}

export function measure(source, width) {
  const score = NumberedNotationScore.create(parseM3NDocument(source))
  // Inject the same text family for measurements and SVG text.
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
  const textMeasurer = { measureText(text, style) {
    context.font = `${style.fontWeight ?? ''} ${style.fontSize ?? 22}px ${style.fontFamily === 'serif' ? '"Scorebook Text"' : style.fontFamily ?? '"Scorebook Text"'}`.trim()
    return { w: Math.max(context.measureText(text).width, style.fontSize * 0.25), h: style.fontSize, baseline: style.fontSize * 0.8 }
  } }
  const [markup] = score.render({ width, paged: false, includeBass: true, textMeasurer })
  const host = document.querySelector('#scratch')
  host.innerHTML = markup
  const svg = host.firstElementChild
  // The browser's generic serif is pinned to the export font by prepare().
  const systems = [...svg.querySelectorAll('g.system')].map(node => {
    const b = node.getBBox()
    return { top: b.y, bottom: b.y + b.height, node }
  })
  if (!systems.length) throw new Error('Empty score')
  let bottom = 0
  const shapes = [...svg.querySelectorAll('text,path,line,circle,rect,polygon,ellipse')].filter(node => !node.closest('defs') && !(node.parentElement === svg && node.tagName === 'rect'))
  const outside = []
  for (const node of shapes) {
    const b = node.getBBox()
    if (!b.width && !b.height) continue
    bottom = Math.max(bottom, b.y + b.height)
    if (b.x < -0.8 || b.x + b.width > width + 0.8) outside.push({ text: node.textContent, x: b.x, right: b.x + b.width })
    if (node.closest('g.system')) continue
    if (node.tagName === 'text' && !node.hasAttribute('data-m3n-role') && b.y + b.height < systems[0].top) continue // score header
    const near = [...systems].sort((a, c) => Math.max(a.top - b.y - b.height, b.y - a.bottom, 0) - Math.max(c.top - b.y - b.height, b.y - c.bottom, 0))[0]
    near.top = Math.min(near.top, b.y)
    near.bottom = Math.max(near.bottom, b.y + b.height)
  }
  const cuts = [0]
  for (let i = 1; i < systems.length; i++) {
    if (systems[i - 1].bottom > systems[i].top + 0.2) throw new Error(`Overlapping systems at ${i}`)
    cuts.push((systems[i - 1].bottom + systems[i].top) / 2)
  }
  cuts.push(bottom + 8)
  const overlaps = []
  for (const selector of ['text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"]', 'g.note text']) {
    const nodes = [...svg.querySelectorAll(selector)].filter(n => n.textContent.trim() && (selector[0] !== 'g' || /^[0-7]$/.test(n.textContent)))
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].getBBox(), b = nodes[j].getBBox()
      if (Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>0.5 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>0.5) overlaps.push({a:nodes[i].textContent,b:nodes[j].textContent,boxA:[a.x,a.y,a.width,a.height],boxB:[b.x,b.y,b.width,b.height]})
    }
  }
  // A cut must not intersect any rendered glyph, relation or lyric.
  const clipped = []
  for (const cut of cuts.slice(1,-1)) for (const node of shapes) {
    const b = node.getBBox()
    if (b.y < cut - 0.2 && b.y+b.height > cut + 0.2) clipped.push({ cut, tag: node.tagName, text:node.textContent, box:[b.x,b.y,b.width,b.height], parent:node.parentElement.outerHTML.slice(0,250) })
  }
  return { width, height: bottom + 8, rows: systems.length, cuts, outside, overlaps, clipped,
    diagnostics: score.diagnostics, markup }
}

export async function outlinePage() {
  const svg = document.querySelector('#print-page > svg')
  // Remove complete off-page primitives before outlining; safe cuts never cross a glyph.
  for (const nested of svg.querySelectorAll('svg')) {
    const view = nested.viewBox.baseVal
    for (const node of nested.querySelectorAll('text,path,line,circle,polygon,ellipse')) {
      if (node.closest('defs')) continue
      const b = node.getBBox()
      if (b.y + b.height < view.y || b.y > view.y + view.height) node.remove()
    }
  }
  await outlineSvgText(svg)
  // Fonts are no longer needed once every character has become a path.
  for (const defs of svg.querySelectorAll('defs')) defs.remove()
  return svg.outerHTML
}
