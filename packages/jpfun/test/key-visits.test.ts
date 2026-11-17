import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import { compileScore, ASTFunctionNode, DefaultTextMeasurer, RecordingPainter } from '../src/core.js'
import { paintedCommandRegions } from '../src/layout/painted-ink.js'
import { commandsOfKind, expectCompileError } from './helpers.js'

test('key visit rows share the ordinary font, accidental glyphs and one centered box', () => {
  const source = '@key(C4,size=16px,visits="1:C4;2:Db4") 1 2'
  const texts = commandsOfKind(source,'text')
  deepEqual(texts.slice(0,4).map(command=>command.text), ['1. 1=','C','2. 1=','D'])
  equal(texts[0]!.style.fontSize,16)
  equal(texts[2]!.style.fontSize,16)
  const result = compileScore(source)
  const node = result.layout.objects.find(node=>node.ast instanceof ASTFunctionNode && node.ast.callName==='key')!
  equal(node.box.visualAxis,node.box.h/2)
  const painter = new RecordingPainter()
  node.paint(painter)
  const measurer = new DefaultTextMeasurer()
  const pieces = painter.commands.map(command => paintedCommandRegions(command, measurer))
  const first = pieces.slice(0, 2).flat(), second = pieces.slice(2).flat()
  const gap = Math.min(...second.map(piece => piece.y)) - Math.max(...first.map(piece => piece.y + piece.h))
  ok(Math.abs(gap - 16 * .2) < 1e-6, 'successive rows retain the configured gap between actual ink')
  const ink = pieces.flat()
  ok(Math.abs(Math.max(...ink.map(piece => piece.y + piece.h)) - Math.min(...ink.map(piece => piece.y)) - node.box.h) < 1e-6,
    'the shared box must cover the complete measured row block without em-height padding')
  ok(node.ast.toString().includes('visits="1:C4;2:Db4"'))
  expectCompileError('@key(C4,visits="1:Hello")','E_KEY_VISITS')
})

test('minor visit rows keep the 6 degree and their target tonic spellings', () => {
  deepEqual(commandsOfKind('@key(C4,degree=6,visits="1:C4;2:Db4")','text').map(command=>command.text), ['1. 6=','A','2. 6=','B'])
})
