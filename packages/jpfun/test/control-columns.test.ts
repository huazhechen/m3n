import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { compileValid } from './helpers.js';
import { ASTFunctionNode } from '../src/functions/ASTtypes.js';
import type { TemporalNodeBase } from '../src/functions/temporal.js';

const nameOf = (node: TemporalNodeBase) => node.ast instanceof ASTFunctionNode ? node.ast.callName : undefined;

test('simultaneous keys, meters and tempos align across voices without duplicate columns', () => {
    const settings = '@key(G4) @meter(3,4) @tempo(96)';
    const result = compileValid(`@voices(@voice({1 2 3 4 | ${settings} 5 6 7 |},""),@voice({1, 2, 3, 4, | ${settings} 5, 6, 7, |},""))`);
    const columns = result.lowering.columns.filter(column => column[0].t.equals(4));
    for (const name of ['key', 'meter', 'tempo']) {
        const settings = columns.filter(column => column.some(node => nameOf(node) === name));
        strictEqual(settings.length, 1);
        strictEqual(settings[0].length, 2);
        const [a, b] = settings[0];
        notStrictEqual(a.track, b.track);
        strictEqual(a.box!.x + a.box!.anchor, b.box!.x + b.box!.anchor);
    }
    const notes = columns.find(column => column.some(node => !node.T.isZero()))!;
    strictEqual(notes.length, 2);
    strictEqual(notes[0].box!.x, notes[1].box!.x);
});

test('successive settings on one voice remain separate ordered columns', () => {
    const result = compileValid('@voices(@voice({@key(F4) @key(G4) 1 2 3 4 |},""),@voice({@key(C4) 1, 2, 3, 4, |},""))');
    const keys = result.lowering.columns.filter(column => column.some(node => nameOf(node) === 'key'));
    deepStrictEqual(keys.map(column => column.length), [2, 1]);
    const firstTrack = keys[0][0].track;
    const ordered = keys.flat().filter(node => node.track === firstTrack);
    strictEqual(ordered.length, 2);
    strictEqual(ordered[0].box!.x < ordered[1].box!.x, true);
});

test('different setting kinds never merge with each other or with notes', () => {
    const result = compileValid('@voices(@voice({@key(G4) 1 2 3 4 |},""),@voice({@tempo(96) 1, 2, 3, 4, |},""))');
    const columns = result.lowering.columns.filter(column => column[0].t.equals(0));
    const key = columns.find(column => column.some(node => nameOf(node) === 'key'))!;
    const tempo = columns.find(column => column.some(node => nameOf(node) === 'tempo'))!;
    notStrictEqual(key, tempo);
    strictEqual(key.length, 1);
    strictEqual(tempo.length, 1);
    strictEqual(columns.find(column => column.some(node => !node.T.isZero()))!.length, 2);
});
