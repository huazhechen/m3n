import { m3nToMei } from '@m3n/notation'
import { VerovioScore } from '@m3n/score-renderer/verovio'
import { headerMarkup, avoidLabelCollisions, resolveLyricCollisions } from '@m3n/score-renderer/view'

import smuflGlyphs from './scorebook-smufl-glyphs.json'

const ns = 'http://www.w3.org/2000/svg'

// Resolve SMuFL references before cropping or combining multiple scores: each
// Verovio SVG owns its glyph definitions, while the final book shares one DOM.
function inlineGlyphs(svg) {
  const glyphs = new Map([...svg.querySelectorAll('defs [id]')].map(node => [node.id, node]))
  for (const use of [...svg.querySelectorAll('use')]) {
    const id = (use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '').slice(1)
    const target = glyphs.get(id)
    if (!target) throw new Error(`Missing staff glyph: ${id}`)
    const group = document.createElementNS(ns, 'g')
    const transform = use.getAttribute('transform') ?? ''
    group.setAttribute('transform', `translate(${use.getAttribute('x') ?? 0} ${use.getAttribute('y') ?? 0}) ${transform}`)
    group.append(target.cloneNode(true))
    group.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
    use.replaceWith(group)
  }
  svg.querySelectorAll('defs').forEach(node => node.remove())
}

// Leipzig paths are copied verbatim from the bundled Verovio source archive,
// data/Leipzig/{code}.xml (1000 units/em, SIL OFL; see Leipzig-NOTICE.txt).
// Text symbols must become paths before the compact exporter applies its text
// font, otherwise metronome notes disappear or turn into unrelated PUA glyphs.
function resolveMusicText(svg) {
  for (const text of [...svg.querySelectorAll('text')]) {
    if (!/[\uE000-\uF8FF]/.test(text.textContent)) continue
    const characters = [], walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
    let node, pendingSpace
    while ((node = walker.nextNode())) {
      const element = node.parentElement
      for (const char of node.textContent) {
        if (/[ \t\r\n]/.test(char)) { pendingSpace = element; continue }
        if (pendingSpace && characters.length) characters.push({char:' ', element:pendingSpace})
        pendingSpace = null
        characters.push({char, element})
      }
    }
    const group = document.createElementNS(ns,'g')
    if (text.hasAttribute('transform')) group.setAttribute('transform',text.getAttribute('transform'))
    let index=0
    for (const {char,element} of characters) {
      const position = text.getStartPositionOfChar(index)
      index += char.length
      if (/\s/.test(char)) continue
      const style = getComputedStyle(element), size = parseFloat(style.fontSize)
      const code = char.codePointAt(0).toString(16).toUpperCase()
      if (/[\uE000-\uF8FF]/.test(char)) {
        if (!smuflGlyphs[code]) throw new Error(`Missing SMuFL text glyph: ${code}`)
        const glyph = document.createElementNS(ns,'g')
        glyph.setAttribute('transform',`translate(${position.x} ${position.y}) scale(${size/1000})`)
        glyph.setAttribute('data-scorebook-smufl',code)
        glyph.innerHTML = smuflGlyphs[code]
        group.append(glyph)
      } else {
        const glyph = document.createElementNS(ns,'text')
        glyph.textContent=char
        for (const [name,value] of Object.entries({x:position.x,y:position.y,'font-size':size,'font-family':'Scorebook Text','font-weight':style.fontWeight,'font-style':style.fontStyle})) glyph.setAttribute(name,String(value))
        group.append(glyph)
      }
    }
    text.replaceWith(group)
  }
}

export async function measureStaff(source, scoreDocument, width, options) {
  const conversion = m3nToMei(source, scoreDocument)
  const mei = conversion.mei.replace(/<hairpin\b/g, '<hairpin place="above"')
  const score = await VerovioScore.create(mei)
  let markup
  try {
    const count = score.prepareLayout({ width, scale: options.staffScale ?? 38, includeBass: options.includeBass ?? true, engraving: options.staffEngraving })
    if (count !== 1) throw new Error('Continuous staff layout must contain one SVG')
    markup = score.renderPage(1)
  } finally { score.destroy() }
  const host = document.querySelector('#scratch')
  host.innerHTML = markup
  const svg = host.firstElementChild
  const view = { width:svg.viewBox.baseVal.width, height:svg.viewBox.baseVal.height }
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(view.height))
  svg.setAttribute('data-scorebook-notation', 'staff')
  if(options.staffLineColor)for(const line of svg.querySelectorAll('g.staff > path'))line.style.stroke=options.staffLineColor
  // The inner viewport otherwise defaults to the cropped page's height.
  const engraving = svg.querySelector('svg.definition-scale')
  engraving.setAttribute('overflow', 'visible')
  engraving.setAttribute('width', String(view.width))
  engraving.setAttribute('height', String(view.height))
  inlineGlyphs(svg)
  for (const text of svg.querySelectorAll('text,tspan')) {
    if (text.getAttribute('font-family') !== 'Leipzig') text.style.fontFamily = '"Scorebook Text"'
  }
  await document.fonts.load('720px Leipzig')
  resolveMusicText(svg)
  avoidLabelCollisions(host)
  resolveLyricCollisions(host)
  // Continuous export derives its viewport from the final complete systems.
  svg.style.removeProperty('height')
  const header = headerMarkup(conversion.headerMetadata, width)
  const container = document.createElementNS(ns, 'g')
  while (svg.firstChild) container.append(svg.firstChild)
  container.setAttribute('transform', `translate(0 ${header.height})`)
  svg.append(container)
  svg.insertAdjacentHTML('afterbegin', header.markup)
  svg.setAttribute('viewBox', `0 0 ${width} ${view.height + header.height}`)
  svg.setAttribute('height', String(view.height + header.height))
  const paper = svg.getBoundingClientRect()
  const box = node => {
    const b = node.getBoundingClientRect()
    return { x:b.left-paper.left, y:b.top-paper.top, width:b.width, height:b.height }
  }
  const staffLines = [...svg.querySelector('g.staff').children].filter(node => node.tagName === 'path').slice(0,5).map(box)
  const staffHeight = Math.max(...staffLines.map(line => line.y)) - Math.min(...staffLines.map(line => line.y))
  const systems = [...svg.querySelectorAll('g.system')].map(node => ({node, ...box(node)}))
  if (!systems.length) throw new Error('Empty staff score')
  // Reserve the requested extra gap without changing staff size or relations.
  let offset = 0, previousBottom
  systems.forEach((system, index) => {
    const gap=options.systemGap ?? 18
    if (index) {
      offset += gap
      offset += Math.max(0, previousBottom+gap-system.y-offset)
    }
    previousBottom=system.y+system.height+offset
    const existing = system.node.getAttribute('transform') ?? ''
    // Convert CSS pixels to this system's local engraving units.
    const unit = system.node.getScreenCTM().d
    system.node.setAttribute('transform', `${existing} translate(0 ${offset / unit})`)
  })
  const bounds = systems.map(({node}) => box(node))
  const cuts = [0], outside = [], clipped = []
  const shapes = [...svg.querySelectorAll('path,text,line,polygon,ellipse,circle')].filter(node => !node.closest('defs'))
  for (let i=1; i<bounds.length; i++) {
    const previous = bounds[i-1], current = bounds[i]
    if (previous.y+previous.height>current.y+.2) throw new Error(`Overlapping staff systems at ${i}`)
    cuts.push((previous.y+previous.height+current.y)/2)
  }
  let bottom = 0
  for (const node of shapes) {
    const b = box(node)
    if (!b.width && !b.height) continue
    bottom = Math.max(bottom, b.y+b.height)
    if (b.x < -.8 || b.x+b.width>width+.8) outside.push({text:node.textContent,x:b.x,right:b.x+b.width})
    for (const cut of cuts.slice(1)) if (b.y<cut-.2 && b.y+b.height>cut+.2) clipped.push({cut,tag:node.tagName})
  }
  const overlaps = []
  for (const {node:system} of systems) for (const selector of ['g.notehead', 'g.syl']) {
    const boxes = [...system.querySelectorAll(selector)].map(box)
    for (let i=0; i<boxes.length; i++) for (let j=i+1; j<boxes.length; j++) {
      const a=boxes[i], b=boxes[j]
      if (Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.5
        && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.5) overlaps.push({selector,a,b})
    }
  }
  cuts.push(bottom+8)
  svg.setAttribute('height', String(bottom+8))
  svg.setAttribute('viewBox', `0 0 ${width} ${bottom+8}`)
  return {width, notation:'staff', staffHeight, height:bottom+8, rows:systems.length, cuts, outside, overlaps, clipped,
    systemDensities:systems.map(()=>0), baselineSteps:bounds.slice(1).map((b,i)=>b.y-bounds[i].y),
    voltaSystems:systems.map(({node})=>Boolean(node.querySelector('.ending'))),
    paragraphSystems:systems.map(()=>null), diagnostics:conversion.diagnostics, markup:svg.outerHTML}
}
