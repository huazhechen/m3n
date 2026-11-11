import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { ANCHOR_KEY } from '../src/functions/temporal.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { automaticBreakPositions } from '../src/layout/wrapping.js';
import { compilePlayback } from '../src/playback/compile.js';
import { playedNotes } from './helpers.js';

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

test('soft breaks allow a short introduction to share the following section', () => {
    const source = '@page(width=1000px) 1 2 3 4 | @br(soft=true) 5 6 7 1 |';
    for (const autoWrap of [false, true]) {
        const result = compileScore(source, { autoWrap });
        assert.equal(result.layout.lineCount, 1);
        assert.equal(result.lowering.duration.toNumber(), 8);
    }
    assert.equal(compileScore(source.replace('@br(soft=true)', '@br()'), { autoWrap: true }).layout.lineCount, 2);
});

test('prefers a section boundary over a similarly balanced ordinary boundary', () => {
    const source = '@set(fontsize=22) @page(width=550px,left=32px,right=32px) '
        + '1 2 3 4 | 1 2 3 4 | @br(soft=true) 1 2 3 4 | 1 2 3 4 | 1 2 3 4 |';
    const result = compileScore(source, { autoWrap: true });
    const next = result.layout.objects.find(node => node.layoutLine === 1 && !node.T.isZero())!;
    assert.equal(result.layout.lineCount, 2);
    assert.equal(next.t.toNumber(), 8);
    const plain = compileScore(source.replace('@br(soft=true)', ''), { autoWrap: true });
    assert.equal(plain.layout.objects.find(node => node.layoutLine === 1 && !node.T.isZero())!.t.toNumber(), 12);
});

test('splits shared repeat boundaries across systems without changing playback or source spans', () => {
    const source = '@set(fontsize=22) @page(width=240px,left=20px,right=20px) |: 1 2 3 4:|: @br(soft=true) 5 6 7 1 :|';
    const plain = compileScore(source);
    const result = compileScore(source, { autoWrap: true });
    const bars = result.layout.objects.filter(node => node.t.equals(4) && (node.ast as any).callName === 'bar');
    assert.deepEqual(bars.map(node => [(node.ast as any).type, node.layoutLine]), [[4, 0], [3, 1]]);
    assert.equal(source.slice(bars[0].ast.sourceSpan.start, bars[0].ast.sourceSpan.end), ':|:');
    const played = (result: typeof plain) => playedNotes(compilePlayback(result.lowering)).map(note => [note.midi, note.start, note.duration]);
    assert.deepEqual(played(result), played(plain));
    for (const node of result.layout.objects.filter(node => !node.T.isZero())) {
        assert.match(source.slice(node.ast.sourceSpan.start, node.ast.sourceSpan.end), /^[1-7]$/);
    }
});

test('keeps soft section breaks synchronized across parallel voices', () => {
    const music = '1 2 3 4 | 1 2 3 4 | @br(soft=true) 5 6 7 1 | 5 6 7 1 | 5 6 7 1 |';
    const result = compileScore(`@set(fontsize=22) @page(width=550px,left=32px,right=32px) @voices(@voice({${music}}),@voice({${music}}))`, { autoWrap: true });
    assert.equal(result.layout.lineCount, 2);
    for (const node of result.layout.objects.filter(node => !node.T.isZero())) {
        const simultaneous = result.layout.objects.filter(other => !other.T.isZero() && other.t.equals(node.t));
        assert.equal(simultaneous.length, 2);
        assert.equal(new Set(simultaneous.map(other => other.layoutLine)).size, 1);
    }
});

test('explicit natural note gaps tighten geometry without changing playback or glyph sizes', () => {
    const source = '@set(fontsize=22px) @page(width=800px,fillRatio=1) 1 2 3 4 |';
    const normal = compileScore(source), tight = compileScore(source, { noteGap: 4.4 });
    const notes = (result: typeof tight) => result.layout.objects.filter(node => node.T.compare(0) > 0);
    const tightNotes = notes(tight), normalNotes = notes(normal);
    for (let i = 1; i < tightNotes.length; i++) {
        const left = getLayoutBounds(tightNotes[i - 1]), right = getLayoutBounds(tightNotes[i]);
        assert.ok(Math.abs(right.x - left.x - left.w - 4.4) < 0.05);
        assert.equal(right.w, getLayoutBounds(normalNotes[i]).w);
    }
    assert.ok(tightNotes.at(-1)!.box.x < normalNotes.at(-1)!.box.x);
    const played = (result: typeof tight) => playedNotes(compilePlayback(result.lowering)).map(note => [note.midi, note.start, note.duration]);
    assert.deepEqual(played(tight), played(normal));
    assert.deepEqual(tightNotes.map(node => node.ast.sourceSpan), normalNotes.map(node => node.ast.sourceSpan));
    for (const noteGap of [-1, NaN, Infinity]) assert.throws(() => compileScore(source, { noteGap }), /noteGap/);
});

test('small natural note gaps still reserve wide lyrics with compact wrapping', () => {
    const source = '@set(lyricspacing="reserve") @page(width=320px) @voice({' + Array(12).fill('1/ 2/ 3/ 4/ 5 6 |').join(' ') + '},,"' + Array(12).fill('internationalization').join(' ') + '")';
    const result = compileScore(source, { autoWrap: true, wrap: 'compact', noteGap: 4.4 });
    const lyrics = result.layout.attachments.flatMap(attachment => attachment.regions).filter(region => region.w > 100);
    assert.ok(lyrics.length > 0);
    for (const [index, left] of lyrics.entries()) for (const right of lyrics.slice(index + 1)) {
        if (left.line !== right.line) continue;
        assert.ok(left.x + left.w <= right.x + 0.1 || right.x + right.w <= left.x + 0.1);
    }
});


test('explicit note gaps retain shorter rhythmic spacing and beam tightening', () => {
    const source = '@set(fontsize=22px) @page(width=800px,fillRatio=1) 1 1 1/ 1/ 1// 1// |';
    const result = compileScore(source, { noteGap: 6.6 });
    const notes = result.layout.objects.filter(node => node.T.compare(0) > 0);
    const gap = (i: number) => {
        const left = getLayoutBounds(notes[i]), right = getLayoutBounds(notes[i + 1]);
        return right.x - left.x - left.w;
    };
    assert.ok(gap(4) < gap(2), `16ths ${gap(4)} must be tighter than 8ths ${gap(2)}`);
    assert.ok(gap(2) < gap(0), `8ths ${gap(2)} must be tighter than quarters ${gap(0)}`);
    assert.ok(gap(4) > 0);
    const plain = compileScore(source);
    const played = (r: typeof result) => playedNotes(compilePlayback(r.lowering)).map(note => [note.midi, note.start, note.duration]);
    assert.deepEqual(played(result), played(plain));
    assert.deepEqual(notes.map(node => node.ast.sourceSpan), plain.layout.objects.filter(node => node.T.compare(0) > 0).map(node => node.ast.sourceSpan));
});

test('minimum clearance measures capacity independently of the natural spacing reference', () => {
    const source = '@set(fontsize=22px) @page(width=390px,left=8px,right=8px,fillRatio=0) ' + Array(6).fill('1 2 3 4 |').join(' ');
    const settings = { autoWrap: true, minimumNoteGap: 8.8 };
    const tight = compileScore(source, { ...settings, noteGap: 8.8 });
    const natural = compileScore(source, { ...settings, noteGap: 13.2 });
    assert.ok(natural.layout.lineCount > 1);
    const notes = (r: typeof natural) => r.layout.objects.filter(node => node.T.compare(0) > 0);
    assert.deepEqual(notes(natural).map(node => node.layoutLine), notes(tight).map(node => node.layoutLine));
    for (const run of Array.from({ length: natural.layout.lineCount }, (_, line) => notes(natural).filter(node => node.layoutLine === line))) {
        for (let i = 1; i < run.length; i++) {
            if (!run[i].t.clone().sub(run[i - 1].t).equals(1)) continue;
            const left = getLayoutBounds(run[i - 1]), right = getLayoutBounds(run[i]);
            assert.ok(right.x - left.x - left.w >= 8.7, `${right.x - left.x - left.w}`);
        }
    }
    const played = (r: typeof natural) => playedNotes(compilePlayback(r.lowering)).map(note => [note.midi, note.start, note.duration]);
    assert.deepEqual(played(natural), played(compileScore(source)));
    for (const minimumNoteGap of [-1, NaN, Infinity, 14]) assert.throws(() => compileScore(source, { ...settings, noteGap: 13.2, minimumNoteGap }), /minimumNoteGap/);
});

test('minimum and natural references scale note, rest and bar clearances together', () => {
    const source = '@set(fontsize=22px) @page(width=800px,fillRatio=1) 1 0 | 1/ 2/ 3// 4// |';
    const measured = (gap: number) => compileScore(source, { noteGap: gap, minimumNoteGap: gap }).layout.objects
        .filter(node => node.T.compare(0) > 0 || node.mergeKey === ANCHOR_KEY);
    const minimum = measured(8.8), natural = measured(13.2);
    const boxes = (r: typeof minimum) => r.map(node => getLayoutBounds(node));
    const low = boxes(minimum), high = boxes(natural);
    // The same glyphs keep their width; total expansion comes entirely from proportionally scaled margins.
    assert.deepEqual(low.map(b => b.w), high.map(b => b.w));
    assert.ok(minimum.some(node => node.mergeKey === ANCHOR_KEY));
    for (let i = 1; i < low.length; i++) {
        const minimumGap = low[i].x - low[i - 1].x - low[i - 1].w;
        const naturalGap = high[i].x - high[i - 1].x - high[i - 1].w;
        assert.ok(Math.abs(naturalGap - minimumGap * 1.5) < 0.05,
            `note/rest/bar gap ${naturalGap} must scale with ${minimumGap}`);
    }
    assert.ok(high.at(-1)!.x > low.at(-1)!.x);
});
