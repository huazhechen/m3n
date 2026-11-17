import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, getLayoutBounds } from '../src/index.js';

for (const level of [0, 1, 2, 3, 4]) test(`minimum rhythmic clearance retains its absolute floor at beam level ${level}`, () => {
    const source = `@page(width=800px,height=0px,fillRatio=1) {1 1 1 1}${'/'.repeat(level)}`;
    const measure = (gap: number, floor: number) => {
        const result = compileScore(source, { noteGap: gap, minimumNoteGap: gap, minimumNoteGapFloor: floor });
        assert.equal(result.diagnostics.length, 0);
        const boxes = result.layout.objects.map(node => getLayoutBounds(node));
        return boxes.slice(1).map((box, index) => box.x - boxes[index].x - boxes[index].w);
    };
    const rhythm = Math.sqrt(2 ** -level) * (level ? .5 : 1);
    for (const base of [8.8, 13.2]) for (const gap of measure(base, 2.2))
        assert.ok(Math.abs(gap - Math.max(base * rhythm, 2.2)) < 1e-6);
    for (const gap of measure(8.8, 0)) assert.ok(Math.abs(gap - 8.8 * rhythm) < 1e-6);
});

test('the absolute floor rejects invalid values and a floor larger than the base minimum', () => {
    for (const floor of [-1, NaN, Infinity, 7])
        assert.throws(() => compileScore('1 2', { noteGap: 11, minimumNoteGap: 6.6, minimumNoteGapFloor: floor }), /minimumNoteGapFloor/);
});

test('justification surplus retains the beam grouping ratio', () => {
    const measure = (fillRatio: number) => compileScore(
        '@page(width=640px,height=0px,fillRatio=' + fillRatio + ') {1 1 1 1}// {1 1 1 1}//',
    ).layout.objects.map(node => getLayoutBounds(node).x);
    const natural = measure(1), justified = measure(0);
    const growth = (i: number) => justified[i + 1] - justified[i] - natural[i + 1] + natural[i];
    assert.ok(growth(3) > 0);
    for (const i of [0, 1, 2, 4, 5, 6])
        assert.ok(Math.abs(growth(i) / growth(3) - 0.5) < 1e-8);
});
