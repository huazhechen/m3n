import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { paintedNodeRegions, paintedCommandRegions } from '../src/layout/painted-ink.js';
import { compileValid, attachmentCommands, recordCommands } from './helpers.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import type { TextMeasurer } from '../src/render/types.js';

for (const size of [16, 22, 32]) test(`parentheses clear numeral ink outside its advance at ${size}px`, () => {
    const textMeasurer: TextMeasurer = { measureText(text, style) {
        const w = style.fontSize * 0.55;
        return { w, advance: w, h: style.fontSize, baseline: style.fontSize * 0.8,
            inkLeft: text === '1' ? -style.fontSize * 0.2 : 0,
            inkRight: w + (text === '5' ? style.fontSize * 0.25 : 0) };
    } };
    const { layout } = compileValid(`@set(fontsize=${size}) 1@a 2 3 5@b @paren(a,b)`, { textMeasurer });
    const parentheses = layout.attachments.find(attachment => attachmentCommands(attachment)
        .some(command => command.kind === 'text' && command.text === '('))!;
    const [left, right] = attachmentCommands(parentheses).filter(command => command.kind === 'text');
    assert.equal(left.kind, 'text'); assert.equal(right.kind, 'text');
    if (left.kind !== 'text' || right.kind !== 'text') return;
    const notes = layout.objects.filter(node => !node.T.isZero());
    const firstInk = paintedNodeRegions(notes[0], textMeasurer);
    const lastInk = paintedNodeRegions(notes.at(-1)!, textMeasurer);
    const leftAdvance = textMeasurer.measureText('(', left.style).w;
    assert.ok(left.x + leftAdvance + size * 0.05 <= Math.min(...firstInk.map(r => r.x)) + 1e-6,
        'opening parenthesis must clear the painted leading numeral');
    assert.ok(right.x >= Math.max(...lastInk.map(r => r.x + r.w)) + size * 0.05 - 1e-6,
        'closing parenthesis must clear the painted trailing numeral');
});

for (const size of [16, 22, 32]) test(`parentheses clear joined beam round caps at ${size}px`, () => {
    const { layout } = compileValid(`@set(fontsize=${size}) @div({1@a 2 3@b}) @paren(a,b)`);
    const parentheses = layout.attachments.find(attachment => attachmentCommands(attachment)
        .some(command => command.kind === 'text' && command.text === '('))!;
    const [left, right] = attachmentCommands(parentheses).filter(command => command.kind === 'text');
    assert.equal(left.kind, 'text'); assert.equal(right.kind, 'text');
    if (left.kind !== 'text' || right.kind !== 'text') return;
    const beams = recordCommands(layout).filter(command => command.kind === 'line')
        .flatMap(command => paintedCommandRegions(command, defaultTextMeasurer));
    assert.ok(beams.length > 0, 'exercise delegated joined-beam painting');
    const advance = defaultTextMeasurer.measureText('(', left.style).w;
    assert.ok(left.x + advance + size * 0.05 <= Math.min(...beams.map(r => r.x)) + 1e-6,
        'opening parenthesis must clear the real round cap');
    assert.ok(right.x >= Math.max(...beams.map(r => r.x + r.w)) + size * 0.05 - 1e-6,
        'closing parenthesis must clear the real round cap');
});
