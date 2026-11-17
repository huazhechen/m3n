import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/index.js';

function controlGap(noteGap?: number, minimumNoteGap?: number) {
    const result = compileScore('@page(width=800px,height=0px,fillRatio=1) @meter(4,4) @meter(3,4)',
        { noteGap, minimumNoteGap });
    assert.equal(result.diagnostics.length, 0);
    const [left, right] = result.layout.objects;
    assert.equal(result.layout.objects.length, 2);
    assert.ok(left.T.isZero() && right.T.isZero());
    return right.box.x - left.box.x - left.box.w;
}

for (const gap of [0, 6, 11, 24]) test(`zero-time control clearance follows configured natural gap ${gap}`, () => {
    // Zero-duration springs use sqrt(.01), retaining one tenth of the base gap.
    assert.ok(Math.abs(controlGap(gap) - gap * .1) < 1e-8);
    assert.ok(Math.abs(controlGap(gap) - controlGap(gap, 0)) < 1e-8);
});

test('omitting natural gap retains the default zero-time clearance', () => {
    assert.ok(Math.abs(controlGap() - 1.2) < 1e-8);
});

for (const [content, ratio] of [
    ['@bar(0) @bar(1)', .1 * 128 / 6],
    ['@voice({1 2},Bass)', .5 + .1 * .45 / 12],
] as const) test(`natural gap scales zero-time spring ratios in ${content}`, () => {
    for (const noteGap of [0, 6, 11, 24]) {
        const result = compileScore(`@page(width=800px,height=0px,fillRatio=1) ${content}`, { noteGap });
        assert.equal(result.diagnostics.length, 0);
        const [left, right] = result.layout.objects;
        assert.ok(left.T.isZero());
        assert.ok(Math.abs(right.box.x - left.box.x - left.box.w - noteGap * ratio) < 1e-8);
    }
});
