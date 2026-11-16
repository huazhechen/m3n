import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import { compileScore, ASTFunctionNode } from '../src/core.js'
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
  ok(node.box.h > 32)
  ok(node.ast.toString().includes('visits="1:C4;2:Db4"'))
  expectCompileError('@key(C4,visits="1:Hello")','E_KEY_VISITS')
})

test('minor visit rows keep the 6 degree and their target tonic spellings', () => {
  deepEqual(commandsOfKind('@key(C4,degree=6,visits="1:C4;2:Db4")','text').map(command=>command.text), ['1. 6=','A','2. 6=','B'])
})
