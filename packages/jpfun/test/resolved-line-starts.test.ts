import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compileScore } from '../src/core.js';

for (const existingBreak of [false, true]) test(`reuses a beat boundary with parallel controls and existingBreak=${existingBreak}`, () => {
    const source = `@page(width=800px) @voices(@voice({1 2 ${existingBreak ? '@br()' : ''} @meter(3,4) 3 4}),@voice({5 6 ${existingBreak ? '@br()' : ''} 7 1}))`;
    const result = compileScore(source, { autoWrap: true, resolvedLineStarts: ['0', '2'] });
    assert.deepEqual(result.diagnostics, []);
    const rows = new Map<number, number>();
    for (const node of result.layout.objects) if (!node.T.isZero()) rows.set(node.layoutLine, (rows.get(node.layoutLine) ?? 0) + 1);
    assert.deepEqual([...rows.values()], [4, 4]);
    const next = result.layout.objects.filter(node => node.t.toString() === '2');
    assert.equal(new Set(next.map(node => node.layoutLine)).size, 1);
    const meter = next.find(node => 'callName' in node.ast && node.ast.callName === 'meter')!;
    assert.ok(meter);
    assert.equal(source.slice(meter.ast.sourceSpan.start, meter.ast.sourceSpan.end), '@meter(3,4)');
})
