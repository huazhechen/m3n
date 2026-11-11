import { test } from 'node:test';
import { compileScore } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { attachmentCommands, assert, nearly } from './helpers.js';

function relations(source: string, kind: string, alignRelations = true) {
    const result = compileScore(source, { alignRelations });
    return { ...result, items: result.layout.attachments.filter(item => item.sourceSpan
        && source.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith(`@${kind}(`)) };
}

test('ties attach to musical members while trills stay above their arcs', () => {
    for (const notes of ['1@a {1^$tr}@b', '{1^$tr}@a 1@b', "1'@a {1'^$tr}@b", '{1^3^$tr}@a {1^3^$tr}@b']) {
        const { layout, items } = relations(`${notes} @tie(a,b)`, 'tie');
        const path = attachmentCommands(items[0]).find(command => command.kind === 'path');
        assert(path?.kind === 'path' && path.commands[0].op === 'M' && path.commands[1].op === 'C', 'expected tie endpoints');
        for (const [index, point] of [path.commands[0], path.commands[1]].entries()) {
            const host = layout.objects[index] as typeof layout.objects[number] & { members?: typeof layout.objects };
            const note = host.members?.filter(node => !node.T.isZero()).at(-1) ?? host;
            assert(nearly(point.y, note.box.y + (note.ports['tie.top']?.y ?? 0)), 'each endpoint must stay on the uppermost musical member');
            const trill = host.members?.find(node => node.T.isZero());
            if (trill) assert(trill.box.y + trill.box.h < items[0].box.y, 'trill must clear the entire arc');
        }
    }
});

test('adjacent tuplets share a baseline across bars, with the tallest group determining clearance', () => {
    const source = "@tuplet({1 2 3},2) | @tuplet({1' 2' 3'},2) @tuplet({4 5 6},2)";
    const aligned = relations(source, 'tuplet');
    const ordinary = relations(source, 'tuplet', false);
    assert(aligned.items.length === 3, 'all three brackets must remain present');
    assert(aligned.items.every(item => nearly(item.box.y, aligned.items[0].box.y)), 'adjacent brackets must align');
    assert(!nearly(ordinary.items[0].box.y, ordinary.items[1].box.y), 'upstream local positioning must remain available');
    for (const item of aligned.items) assert(item.box.y + item.box.h < Math.min(...aligned.layout.objects.map(node => node.box.y)), 'aligned brackets must clear the notes');
});

test('regular notes interrupt alignment groups, and nested tuplets retain their outer layer', () => {
    const disconnected = relations("@tuplet({1 2 3},2) 4 @tuplet({1'' 2'' 3''},2)", 'tuplet');
    assert(!nearly(disconnected.items[0].box.y, disconnected.items[1].box.y), 'unrelated groups must retain local clearance');
    const nested = relations("@tuplet({@tuplet({1/ 2/ 3/},2) 4},3) @tuplet({@tuplet({5'/ 6'/ 7'/},2) 1},3)", 'tuplet');
    assert(nested.items.length === 4, 'both nested groups must remain present');
    assert(nearly(nested.items[1].box.y, nested.items[3].box.y), 'outer siblings must align');
    assert(nested.items[1].box.y + nested.items[1].box.h <= Math.min(nested.items[0].box.y, nested.items[2].box.y), 'outer brackets must clear both inner brackets, including later content');
});

test('alignment respects system and staff boundaries', () => {
    for (const source of [
        "@tuplet({1 2 3},2) @br() @tuplet({1'' 2'' 3''},2)",
        "@voices(@voice({@tuplet({1 2 3},2)}),@voice({@tuplet({1'' 2'' 3''},2)}))",
    ]) {
        const { layout, items } = relations(source, 'tuplet');
        assert(items.length === 2, 'both brackets must remain present');
        for (const item of items) {
            const region = item.regions[0];
            const hosts = layout.objects.filter(node => node.layoutLine === region.line && node.track === region.track && !node.T.isZero());
            const gap = Math.min(...hosts.map(node => getLayoutBounds(node, true).y)) - (item.box.y + item.box.h);
            assert(gap < 6, 'other systems and staves must not lift this bracket');
        }
    }
});

test('adjacent alternate endings share their top rule without obscuring their labels', () => {
    const source = "|: 1@a 2@b :| 3'@c 4'@d | @volta(a,b,1) @volta(c,d,2)";
    const aligned = relations(source, 'volta');
    const ordinary = relations(source, 'volta', false);
    assert(aligned.items.length === 2 && nearly(aligned.items[0].box.y, aligned.items[1].box.y), 'adjacent endings must align');
    assert(!nearly(ordinary.items[0].box.y, ordinary.items[1].box.y), 'default compilation must keep local positioning');
    assert(aligned.items.map(item => attachmentCommands(item).find(command => command.kind === 'text')?.text).join(',') === '1.,2.', 'ending labels must be preserved');
});

test('adjacent automatic ties share arc height while their endpoints and explicit heights stay intact', () => {
    const source = '1@a 2@b 3 4 5 6 7 1@c @tie(a,b) @tie(b,c)';
    const heights = (alignRelations: boolean) => relations(source, 'tie', alignRelations).items.map(item => {
        const path = attachmentCommands(item).find(command => command.kind === 'path');
        assert(path?.kind === 'path' && path.commands[0].op === 'M' && path.commands[1].op === 'C', 'expected cubic arc');
        return (path.commands[0].y - path.commands[1].cy1) * 0.75;
    });
    const aligned = heights(true), ordinary = heights(false);
    assert(nearly(aligned[0], aligned[1]) && ordinary[0] < ordinary[1], 'only opted-in automatic ties should align');
    const fixed = relations(source.replace('@tie(a,b)', '@tie(a,b,height=3px)'), 'tie');
    const path = attachmentCommands(fixed.items[0]).find(command => command.kind === 'path');
    assert(path?.kind === 'path' && path.commands[0].op === 'M' && path.commands[1].op === 'C'
        && nearly((path.commands[0].y - path.commands[1].cy1) * 0.75, 3), 'explicit heights must remain authoritative');
});
