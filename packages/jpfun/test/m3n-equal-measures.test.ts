import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { ANCHOR_KEY } from '../src/functions/temporal.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { compilePlayback } from '../src/playback/compile.js';
import { playedNotes } from './helpers.js';

test('equal measures reserve identical cells while preserving different internal rhythms', () => {
    const source = '@page(width=1400px,left=32px,right=32px,fillRatio=0) 1--- | 1/ 2/ 3/ 4/ 5/ 6/ 7/ 1\'/ | 1 2 3 4 |||';
    const normal = compileScore(source), equal = compileScore(source, { equalMeasures: true });
    const boundaries = (result: typeof equal) => result.layout.objects.filter(n => n.mergeKey === ANCHOR_KEY).map(n => n.box.x + n.box.anchor);
    const bars = boundaries(equal), unit = bars[0] - 32;
    bars.forEach((x, i) => assert.ok(Math.abs(x - 32 - unit * (i + 1)) < 1e-6));
    assert.ok(Math.abs(boundaries(normal)[0] - bars[0]) > 20);
    assert.equal(equal.lowering.duration.toString(), normal.lowering.duration.toString());
    assert.deepEqual(equal.layout.objects.filter(n => !n.T.isZero()).map(n => [n.t.toString(), n.T.toString(), n.ast.sourceSpan]),
        normal.layout.objects.filter(n => !n.T.isZero()).map(n => [n.t.toString(), n.T.toString(), n.ast.sourceSpan]));
    assert.deepEqual(equal.diagnostics, []);
});

test('equal-measure pagination preserves repeats, grace notes and complete tuplets', () => {
    const music = Array(8).fill('@grace({1},{7/}) @tuplet({2 3 4},2) 5 | 6 - - - |').join(' ');
    const source = `@page(width=320px,height=360px,left=20px,right=20px,fillRatio=0) |: ${music} :|`;
    const normal = compileScore(source, { autoWrap: true });
    const equal = compileScore(source, { autoWrap: true, equalMeasures: true });
    const played = (result: typeof normal) => playedNotes(compilePlayback(result.lowering)).map(n => [n.midi, n.start, n.duration]);
    assert.deepEqual(played(equal), played(normal));
    assert.ok(equal.layout.pages.length > 1);
    assert.deepEqual(equal.diagnostics, []);
    for (const attachment of equal.lowering.attachments) {
        if (attachment.endPoints?.length === 3) assert.equal(new Set(attachment.endPoints.map(n => n.layoutLine)).size, 1);
    }
});

test('equal-measure wrapping budgets the densest measure and preserves parallel voices and lyrics', () => {
    const music = Array(6).fill('1--- | 1/ 2/ 3/ 4/ 5/ 6/ 7/ 1\'/ |').join(' ');
    const source = `@page(width=640px,left=32px,right=32px,fillRatio=0) @voices(@voice({${music}},,"甲 乙 丙 丁 戊 己 庚 辛 壬"),@voice({${music}}))`;
    const result = compileScore(source, { autoWrap: true, equalMeasures: true });
    const notes = result.layout.objects.filter(n => !n.T.isZero());
    const normal = compileScore(source, { autoWrap: true });
    assert.equal(result.lowering.duration.toString(), normal.lowering.duration.toString());
    assert.equal(notes.length, normal.layout.objects.filter(n => !n.T.isZero()).length);
    const lines = new Set(notes.map(n => n.layoutLine));
    assert.ok(lines.size > 1);
    for (const line of lines) {
        const members = result.layout.objects.filter(n => n.layoutLine === line), first = members.find(n => !n.T.isZero())!;
        const bars = [...new Map(members.filter(n => n.mergeKey === ANCHOR_KEY && n.t.compare(first.t) > 0)
            .map(n => [n.t.toString(), n.box.x + n.box.anchor])).values()];
        if (bars.length > 1) {
            const unit = bars[0] - 32;
            bars.forEach((x, i) => assert.ok(Math.abs(x - 32 - unit * (i + 1)) < 1e-6));
        }
        for (const node of members) {
            const b = getLayoutBounds(node);
            assert.ok(b.x >= 31 && b.x + b.w <= 609, JSON.stringify(b));
        }
    }
    for (const note of notes) {
        const partners = notes.filter(n => n.t.equals(note.t));
        assert.ok(partners.every(n => n.layoutLine === note.layoutLine && Math.abs(n.box.x - note.box.x) < .01));
        assert.match(source.slice(note.ast.sourceSpan.start, note.ast.sourceSpan.end), /^(?:[1-7]'?|-)$/);
    }
    assert.deepEqual(result.diagnostics, []);
});
