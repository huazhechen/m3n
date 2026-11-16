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
    assert(dynamic.box.y + dynamic.box.h < Math.min(bracket.box.y,slur.box.y), 'the expression must clear both relations');
});
