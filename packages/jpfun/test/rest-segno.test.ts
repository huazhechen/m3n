import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { compileScore } from '../src/pipeline.js';
import { ASTFunctionNode } from '../src/functions/ASTtypes.js';
import { ErrorDiagnostic } from '../src/diagnostic.js';

test('one-voice Segno stays at the shared rest onset in either voice order', () => {
    for (const reverse of [false, true]) {
        const voices = ['1 2 3 4 | @symbol(segno) @meter(6,8) @rest(2) | 1 2 3 |', '1 2 3 4 | @meter(6,8) @rest(2) | 1 2 3 |'];
        if (reverse) voices.reverse();
        const result = compileScore(`@meter(4,4)\n${voices.map(voice => `N: ${voice}`).join('\n')}`);
        strictEqual(result.diagnostics.filter(d => d instanceof ErrorDiagnostic).length, 0);
        const named = (name: string) => result.lowering.columns.flat().filter(node => node.ast instanceof ASTFunctionNode && node.ast.callName === name);
        deepStrictEqual(named('rest').map(node => [node.t.toNumber(), node.T.toNumber()]), [[4, 6], [4, 6]]);
        deepStrictEqual(named('symbol').map(node => node.t.toNumber()), [4]);
        strictEqual(result.lowering.duration.toNumber(), 13);
    }
});
