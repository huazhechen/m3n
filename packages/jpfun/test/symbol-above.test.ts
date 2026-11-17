import { paintedCommandRegions, paintedNodeRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { RecordingPainter } from '../src/render/recording.js';
import { ribbonAtX } from '../src/functions/tie/ribbon.js';
import { deepStrictEqual } from 'node:assert';
import { test } from 'node:test';
import { compileScore } from '../src/pipeline.js';
import { compilePlayback } from '../src/playback/compile.js';
import { assert, expectLoweringError, lower, nearly, parse, playedNotes } from './helpers.js';

test('anchored dynamics clear tuplet brackets and preserve onset velocity without extra columns', () => {
    const source = '@tuplet({1@a 2 3},2) 4 @symbol(p,size=12px,above=a)';
    for (const input of [source, parse(source).toString(source)]) {
        const result = compileScore(input);
        assert(result.diagnostics.length === 0);
        const [bracket, dynamic] = result.layout.attachments;
        assert(dynamic.box.y + dynamic.box.h < bracket.box.y);
        assert(result.layout.objects.length === 4);
        assert(nearly(result.lowering.duration.toNumber(), 3));
        const notes = playedNotes(compilePlayback(lower(input)));
        assert(notes.map(note => note.velocity).join(' ') === '48 48 48 48');
    }
});

test('an outer dynamic does not raise a tuplet bracket or its neighboring aligned group', () => {
    const music = '@tuplet({1@a 2 3},2) @tuplet({4 5 6},2)';
    const plain = compileScore(music, { alignRelations: true });
    const marked = compileScore(music + ' @symbol(mf,size=12px,above=a)', { alignRelations: true });
    const axes = (result: typeof plain) => result.layout.objects[0].box.y + result.layout.objects[0].box.visualAxis;
    for (let i = 0; i < 2; i++) {
        assert(nearly(plain.layout.attachments[i].box.y - axes(plain), marked.layout.attachments[i].box.y - axes(marked)));
    }
});


test('anchored dynamics retain separate host onsets while navigation stays temporal', () => {
    const source = '@tuplet({1@a 2 3},2) @tuplet({4@b 5 6},2) @symbol(p,above=a) @symbol(f,above=b)';
    const notes = playedNotes(compilePlayback(lower(source)));
    assert(notes.map(note => note.velocity).join(' ') === '48 48 48 96 96 96');
    expectLoweringError('1@a @symbol(dc,above=a)', 'E_SYMBOL_INVALID_HOST');
});


test('tuplets stay inside slurs and dynamics stay outside both', () => {
    const result = compileScore('@tuplet({1@a 2 3},2) 4 5@b @tie(a,b) @symbol(mf,size=12px,above=a)', {alignRelations:true});
    const [bracket, slur, dynamic] = result.layout.attachments;
    assert(slur.box.y + slur.box.h < bracket.box.y, 'the slur must clear the rhythm bracket');
    assert(dynamic.box.y + dynamic.box.h < bracket.box.y);
    const painter = new RecordingPainter(); slur.paint(painter);
    const curve = painter.commands.find(c => c.kind === 'path');
    assert(curve?.kind === 'path');
    for (let i = 0; i <= 100; i++) {
        const x = dynamic.box.x + dynamic.box.w * i / 100;
        const edge = ribbonAtX(curve.commands, x);
        if (edge) assert(dynamic.box.y + dynamic.box.h <= edge.top - 22 * .12 + 1e-5);
    }
});


test('anchored ornaments and fermatas preserve the folded host playback without leaking to its next note', () => {
    const notes = (source: string) => playedNotes(compilePlayback(lower(source))).map(n => ({
        midi: n.midi, velocity: n.velocity, start: n.start.toString(), end: n.end.toString(), bpm: n.bpm,
    }));
    for (const symbol of ['tr', 'prall', 'mordent', 'fermata', 'accent']) {
        for (const host of ['1', '0', '@up(1,3,5)', '@grace({1},{7})']) {
            const source = `${host}@a 2 @symbol(${symbol},above=a)`;
            const expected = notes(`@up({${host}},@symbol(${symbol})) 2`);
            deepStrictEqual(notes(source), expected);
            deepStrictEqual(notes(parse(source).toString(source)), expected);
        }
    }
    deepStrictEqual(notes('1@a 1@b 2 @tie(a,b) @symbol(fermata,above=a)'), notes('@up(1,$fermata)@a 1@b 2 @tie(a,b)'));
    deepStrictEqual(notes('1@a 2@b @symbol(tr,above=a) @symbol(p,above=a) @symbol(f,above=b)'), notes('@up(1,$tr,$p) @up(2,$f)'));
});

test('an anchored dynamic clears the local bow footprint without reserving its remote apex', () => {
    const result = compileScore('1@a 2 3 4@b @tie(a,b) @symbol(p,size=12px,above=a)', { alignRelations: true });
    const [slur, dynamic] = result.layout.attachments;
    const painter = new RecordingPainter(); slur.paint(painter);
    const curve = painter.commands.find(c => c.kind === 'path');
    assert(curve?.kind === 'path');
    let gap = Infinity;
    for (let i = 0; i <= 2000; i++) {
        const edge = ribbonAtX(curve.commands, dynamic.box.x + dynamic.box.w * i / 2000);
        if (edge) gap = Math.min(gap, edge.top - dynamic.box.y - dynamic.box.h);
    }
    assert(nearly(gap, result.layout.objects[0].ast.size * .12), 'use only the measured local curve clearance');
    assert(dynamic.box.y + dynamic.box.h > slur.box.y, 'the remote apex must not become a rectangular obstacle');
});


test('anchored fermatas clear the note by their scaled painted stroke, without temporal padding', () => {
    for (const size of [6,12,24]) {
        const result = compileScore(`1@a 2 @symbol(fermata,size=${size}px,above=a)`, { alignRelations: true });
        const host = result.layout.objects[0], attachment = result.layout.attachments[0];
        const hostTop = Math.min(...paintedNodeRegions(host,defaultTextMeasurer).map(r=>r.y));
        const painter = new RecordingPainter(); attachment.paint(painter);
        const ink = painter.commands.flatMap(c=>paintedCommandRegions(c,defaultTextMeasurer));
        const left = Math.min(...ink.map(r=>r.x)), right = Math.max(...ink.map(r=>r.x+r.w));
        const top = Math.min(...ink.map(r=>r.y)), bottom = Math.max(...ink.map(r=>r.y+r.h));
        assert(nearly(hostTop-bottom,host.ast.size*.12), 'actual stroke must retain exactly the common mark gap');
        assert(nearly(attachment.box.x,left)&&nearly(attachment.box.y,top));
        assert(nearly(attachment.box.w,right-left)&&nearly(attachment.box.h,bottom-top));
    }
});


test('close accents reserve their complete stroke and keep the common gap from the note', () => {
    const result=compileScore('@up(1,@symbol(accent,size=12px))', {alignRelations:true});
    const node=result.layout.objects[0], recording=new RecordingPainter();node.paint(recording);
    const ink=recording.commands.flatMap(c=>paintedCommandRegions(c,defaultTextMeasurer));
    const top=Math.min(...ink.map(r=>r.y));
    assert(nearly(node.box.y,top),'fold top must include the complete stroke');
    const note=recording.commands.find(c=>c.kind==='text'&&c.text==='1')!;
    const accent=recording.commands.find(c=>c.kind==='path')!;
    const noteTop=paintedCommandRegions(note,defaultTextMeasurer)[0].y;
    const accentBottom=Math.max(...paintedCommandRegions(accent,defaultTextMeasurer).map(r=>r.y+r.h));
    assert(nearly(noteTop-accentBottom,22*.12),'close accent must retain the common measured gap');
});
