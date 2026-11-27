// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { STAFF_SCALE } from './staff-engine.js'
import { findAll, hasClass, SvgGeometry, textContent, textMeasurer } from './layout-svg.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

function engrave(source: string, tempoScale = 1) {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  document.measures = document.measures.map(measure => ({ ...measure, tempo: measure.tempo * tempoScale }))
  const measure = textMeasurer(), lines = planStaffLines(document, 528, false, measure, .25)
  return { document, systems: engraveStaffSystems(document, lines, 528, measure, .25, false, tempoScale), measure }
}

describe('staff tempo captions', () => {
  it('keeps the basic exercises instruction below its section heading and above its own music', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const { document, systems, measure } = engrave(source)
    const node = systems[0]!.node, geometry = new SvgGeometry(node, measure)
    const instruction = findAll(node, n => hasClass(n, 'dir') && textContent(n) === '快速吹吸切换')
    expect(instruction).toHaveLength(1)
    const heading = findAll(node, n => hasClass(n, 'reh'))[0]!
    const tempo = findAll(node, n => hasClass(n, 'tempo'))[0]!
    const first = document.measures[0]!.melody[0]!
    const note = findAll(node, n => n.attributes.id === first.id)[0]!
    expect(textContent(heading)).toBe('机能训练')
    expect(textContent(tempo)).not.toContain('快速吹吸切换')
    expect(geometry.ink(tempo).bottom).toBeLessThan(geometry.ink(heading).top)
    expect(geometry.ink(heading).bottom).toBeLessThan(geometry.ink(instruction[0]!).top)
    expect(geometry.ink(instruction[0]!).bottom).toBeLessThan(geometry.ink(note).top)
    expect(geometry.ink(instruction[0]!).left).toBeLessThan(geometry.ink(note).right)
    expect(geometry.ink(instruction[0]!).right).toBeGreaterThan(geometry.ink(note).left)
  })

  it.each([false, true])('keeps ordinary instructions separate from expressions with a section heading: %s', section => {
    const { systems } = engrave(`{4/4}{60qpm}\n${section ? '===Practice{br}\n' : ''}N: {text=Switch breath}{expression=Largo}1 2 3 4 |||`)
    const node = systems[0]!.node
    const tempo = findAll(node, n => hasClass(n, 'tempo'))[0]!
    expect(textContent(tempo)).toContain('Largo')
    expect(textContent(tempo)).not.toContain('Switch breath')
    expect(findAll(node, n => hasClass(n, 'dir')).map(textContent)).toEqual(['Switch breath'])
  })

  it.each([.5, 1, 1.5].flatMap(tempoScale => [false, true].map(rests => ({ tempoScale, rests }))))(
    'shares expression typography at the opening and both change positions ($tempoScale, rests=$rests)', ({ tempoScale, rests }) => {
      const opening = rests ? '0^ (0 1) 2' : '1 2 3 4'
      const { systems } = engrave(`{4/4}{120qpm}\nN: {expression=Largo}${opening} | {60qpm}{expression=Meno}3 4 5 6 | 1 {90qpm}{expression=Allegro}2 3 4 |||`, tempoScale)
      const tempos = systems.flatMap(system => findAll(system.node, n => hasClass(n, 'tempo')))
      expect(tempos).toHaveLength(3)
      expect(systems.flatMap(system => findAll(system.node, n => hasClass(n, 'dir')))).toHaveLength(0)
      const captions = ['Largo', 'Meno', 'Allegro']
      for (const [i, tempo] of tempos.entries()) {
        const label = findAll(tempo, n => hasClass(n, 'tempo-direction'))[0]!
        const numeric = findAll(tempo, n => hasClass(n, 'tempo-metronome'))[0]!
        expect(textContent(label)).toBe(captions[i])
        expect(textContent(numeric)).toContain(`= ${[120, 60, 90][i]! * tempoScale}`)
        const a = findAll(label, n => n.tagName === 'text')[0]!
        const b = findAll(numeric, n => n.tagName === 'text')[0]!
        for (const name of ['font-size', 'font-family', 'font-weight', 'y']) expect(b.attributes[name]).toBe(a.attributes[name])
        expect(Number(b.attributes['font-size'])).toBeCloseTo(scoreLayoutConfig.staff.annotation / STAFF_SCALE)
      }
    },
  )

  it('keeps a tempo change after an opening rest at its actual event', () => {
    const { systems } = engrave('{4/4}{120qpm}\nN: 0 {60qpm}{expression=Meno}1 2 3 |||')
    const tempos = systems.flatMap(system => findAll(system.node, n => hasClass(n, 'tempo')))
    expect(tempos).toHaveLength(2)
    expect(findAll(tempos[0]!, n => hasClass(n, 'tempo-direction'))).toHaveLength(0)
    expect(textContent(tempos[0]!)).toContain('= 120')
    expect(textContent(tempos[1]!)).toContain('Meno')
    expect(textContent(tempos[1]!)).toContain('= 60')
  })

  it('anchors the opening caption before leading rests and leaves later directions on their events', () => {
    const { document, systems, measure } = engrave('{4/4}{120qpm}\nN: {expression=Largo}0^ (0 1) {expression=dolce}2 |||')
    const node = systems[0]!.node, geometry = new SvgGeometry(node, measure)
    const caption = findAll(node, n => hasClass(n, 'tempo-direction'))[0]!
    const firstSound = document.measures[0]!.melody.find(entry => entry.event.kind !== 'rest')!
    const note = findAll(node, n => n.attributes.id === firstSound.id)[0]!
    expect(geometry.ink(caption).left).toBeLessThan(geometry.ink(note).left)
    const directions = findAll(node, n => hasClass(n, 'dir'))
    expect(directions).toHaveLength(1)
    expect(textContent(directions[0]!)).toBe('dolce')
  })
})
