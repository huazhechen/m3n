import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import { attachmentCommands } from './helpers.js';

test('tuplet spacing reserves separate painted pieces without filling the space beside its count', () => {
    for (const source of ['@tuplet({1 2 3},2)', '@tuplet({1/ 2/ 3/},2)']) {
        const result = compileScore(source);
        assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
        const bracket = result.layout.attachments.find(a => attachmentCommands(a).some(c => c.kind === 'text' && c.text === '3'))!;
        const commands = attachmentCommands(bracket);
        const ink = commands.flatMap(c => paintedCommandRegions(c, defaultTextMeasurer));
        const count = commands.find(c => c.kind === 'text')!;
        const text = paintedCommandRegions(count, defaultTextMeasurer)[0];
        const hook = commands.find(c => c.kind === 'line' && c.x1 === c.x2)!;
        assert.ok(hook.kind === 'line');
        const emptyX = (hook.x1 + text.x) / 2;
        const emptyY = text.y + .01;
        assert.ok(!ink.some(r => emptyX > r.x && emptyX < r.x + r.w && emptyY > r.y && emptyY < r.y + r.h),
            'the independent paint commands leave empty space beside the count');
        assert.ok(!bracket.regions.some(r => emptyX > r.x && emptyX < r.x + r.w && emptyY > r.y && emptyY < r.y + r.h),
            'empty space must not force an adjacent system away');
        assert.equal(bracket.regions.length, ink.length);
        for (const piece of ink) assert.ok(bracket.regions.some(r =>
            Math.abs(r.x - piece.x) < 1e-6 && Math.abs(r.y - piece.y) < 1e-6
            && Math.abs(r.w - piece.w) < 1e-6 && Math.abs(r.h - piece.h) < 1e-6),
        'every visible stroke and the count must retain their measured envelope');
    }
});
