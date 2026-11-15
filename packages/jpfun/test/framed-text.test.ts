import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { compileValid, assert, nearly } from './helpers.js';

test('framed inline text reserves its native padding without affecting music time or lyric slots', () => {
    const plain = compileValid('@voice({@text(A,size=14px,weight=700) 1 2},"","甲乙")');
    const framed = compileValid('@voice({@text(A,size=14px,weight=700,frame=true) 1 2},"","甲乙")');
    const text = (result: typeof plain) => result.layout.objects.find(node => 'frame' in node.ast)!;
    assert(nearly(text(framed).box.w - text(plain).box.w, 7), 'horizontal padding');
    assert(nearly(text(framed).box.h - text(plain).box.h, 7), 'vertical padding');
    strictEqual(text(framed).T.isZero(), true);
    const notes = (result: typeof plain) => result.layout.objects.filter(node => !node.T.isZero());
    deepStrictEqual(notes(framed).map(node => [node.t.toString(), node.T.toString()]), notes(plain).map(node => [node.t.toString(), node.T.toString()]));
    assert(text(framed).box.x + text(framed).box.w < notes(framed)[0]!.box.x, 'label stays before music');
    strictEqual(framed.layout.attachments.length, plain.layout.attachments.length);
});
