import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { automaticBreakPositions } from '../src/layout/wrapping.js';

test('automatic wrapping fits long scores and keeps original event source spans', () => {
    const source = '@page(width=320px)\n' + Array(32).fill('1 2 3 4 |').join(' ');
    const result = compileScore(source, { autoWrap: true });
    assert.ok(result.layout.lineCount > 4);
    const notes = result.layout.objects.filter(node => node.T.compare(0) > 0);
    assert.equal(notes.length, 128);
    for (const node of notes) {
        assert.match(source.slice(node.ast.sourceSpan.start, node.ast.sourceSpan.end), /^[1-4]$/);
        const box = getLayoutBounds(node);
        assert.ok(box.x >= 39 && box.x + box.w <= 281, JSON.stringify(box));
    }
});

test('wrapping preserves explicit segment breaks and aligns parallel voices', () => {
    const source = '@page(width=380px)\nN: {' + Array(12).fill('1 2 3 4 |').join(' ') + ' @br() 5 6 7 1 |}\nN: {' + Array(12).fill('1, - 5, - |').join(' ') + ' @br() 2, - 1, - |}';
    const result = compileScore(source, { autoWrap: true });
    const notes = result.layout.objects.filter(node => node.T.compare(0) > 0);
    const linesByTime = new Map<string, Set<number>>();
    for (const node of notes) {
        const key = node.t.toString();
        const lines = linesByTime.get(key) ?? new Set(); lines.add(node.layoutLine); linesByTime.set(key, lines);
    }
    assert.ok(result.layout.lineCount > 2);
    assert.ok([...linesByTime.values()].every(lines => lines.size === 1));
});

test('wraps dotted and divided single-event wrappers without changing their duration', () => {
    const source = '@page(width=320px)\n' + Array(10).fill('@dot({@div({1},1)},1) 2/ 3/ 4/ 5/ 6/ |').join(' ');
    const result = compileScore(source, { autoWrap: true });
    assert.ok(result.layout.lineCount > 1);
    assert.equal(result.lowering.duration.toNumber(), 32.5);
});

test('splits an oversized measure without overlapping its note glyphs', () => {
    const source = '@page(width=320px)\n' + Array(64).fill('1/').join(' ') + ' |';
    const result = compileScore(source, { autoWrap: true });
    const notes = result.layout.objects.filter(node => node.T.compare(0) > 0);
    assert.equal(notes.length, 64);
    assert.ok(result.layout.lineCount > 1);
    for (const node of notes) { const b = getLayoutBounds(node); assert.ok(b.x >= 39 && b.x + b.w <= 281); }
});

test('automatic wrapping includes the complete lyric occupancy at both endpoints', () => {
    const result = compileScore('@set(lyricspacing="reserve") @page(width=320px) @voice({' + Array(12).fill('1/ 2/ 3/ 4/ 5 6 |').join(' ') + '},,"' + Array(12).fill('internationalization').join(' ') + '")', { autoWrap: true });
    const lyrics = result.layout.attachments.flatMap(attachment => attachment.regions).filter(region => region.w > 100);
    for (const [index, left] of lyrics.entries()) for (const right of lyrics.slice(index + 1)) {
        if (left.line !== right.line) continue;
        assert.ok(left.x + left.w <= right.x || right.x + right.w <= left.x);
    }
});

test('keeps key, meter and tempo changes with the following note in each voice', () => {
    const music = Array(8).fill('1 2 3 4 |').join(' ')
        + ' @key(G4) @meter(2,4) @tempo(80) 5 6 | @meter(4,4) 1 2 3 4 |';
    const source = `@page(width=320px) @voices(@voice({${music}}),@voice({${music}}))`;
    const result = compileScore(source, { autoWrap: true });
    for (const node of result.layout.objects.filter(node => ['key', 'meter', 'tempo'].includes((node.ast as any).callName))) {
        const next = result.layout.objects.find(candidate => candidate.track === node.track && candidate.t.equals(node.t) && !candidate.T.isZero());
        assert.ok(next);
        assert.equal(node.layoutLine, next.layoutLine, `${node.ast.toString(source)} was orphaned`);
    }
    assert.equal(result.lowering.duration.toNumber(), 38);
});

test('an opening repeat belongs to the following measure when wrapping', () => {
    const source = '@page(width=320px) ' + Array(8).fill('1 2 3 4 |').join(' ') + ' |: 5 6 7 1 :|';
    const result = compileScore(source, { autoWrap: true });
    const repeat = result.layout.objects.find(node => (node.ast as any).type === 3)!;
    const next = result.layout.objects.find(node => node.t.equals(repeat.t) && !node.T.isZero())!;
    assert.equal(repeat.layoutLine, next.layoutLine);
    assert.ok(repeat.box.x < next.box.x);
});

test('balances dense measure fragments at whole beats without orphaning their tails', () => {
    const source = '@page(width=320px,left=32px,right=32px) ' + Array(16).fill('1//').join(' ') + ' |';
    const result = compileScore(source, { autoWrap: true });
    const notes = result.layout.objects.filter(node => !node.T.isZero());
    const lines = new Map<number, typeof notes>();
    for (const note of notes) lines.set(note.layoutLine, [...(lines.get(note.layoutLine) ?? []), note]);
    assert.equal(notes.length, 16);
    assert.equal(lines.size, 2);
    for (const line of lines.values()) {
        assert.equal(line[0].t.denominator, 1, 'a split must preserve a complete beat group');
        assert.equal(line.length, 8, 'the two halves must be balanced');
        for (const note of line) assert.equal(source.slice(note.ast.sourceSpan.start, note.ast.sourceSpan.end), '1');
    }
});

test('inserts a break before a complete tuplet instead of inside its first member', () => {
    const source = '@page(width=320px) ' + Array(8).fill('@tuplet({1/ 2/ 3/},2) 4 5 6 |').join(' ');
    const naturalSource = source.replace('width=320px', 'width=1000000px');
    const positions = automaticBreakPositions(compileScore(naturalSource).layout, 240);
    assert.ok(positions.length > 0);
    for (const position of positions) assert.ok(naturalSource.slice(position).startsWith('@tuplet('));
    const result = compileScore(source, { autoWrap: true });
    assert.equal(result.lowering.duration.toNumber(), 32);
    assert.ok(result.layout.lineCount > 1);
    for (const attachment of result.lowering.attachments) {
        if (!attachment.endPoints || attachment.endPoints.length !== 3) continue;
        assert.equal(new Set(attachment.endPoints.map(node => node.layoutLine)).size, 1);
    }
});
