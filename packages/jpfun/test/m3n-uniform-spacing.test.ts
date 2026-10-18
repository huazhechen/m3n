import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';

const music = Array.from({ length: 8 }, (_, i) => `${i === 2 ? '1@a' : '1'} 2 3 ${i === 4 ? '4@b' : '4'} |`).join(' @br() ');
const source = `@page(width=800px,top=8px,bottom=8px) ${music} @volta(a,b,1)`;
const axes = (result: ReturnType<typeof compileScore>) => Array.from({ length: result.layout.lineCount }, (_, line) => {
    const note = result.layout.objects.find(node => node.layoutLine === line && !node.T.isZero())!;
    return note.box.y + note.box.visualAxis;
});
const nearly = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test('a cross-system volta reserves one tall band only on its actual three systems', () => {
    const result = compileScore(source, { uniformSystemHeight: true, alignRelations: true });
    const bare = compileScore(source.replace(' @volta(a,b,1)', ''), { uniformSystemHeight: true, alignRelations: true });
    const y = axes(result), normal = axes(bare)[1] - axes(bare)[0];
    const tall = y[2] - y[1];
    assert.ok(tall > normal + 10);
    for (let line = 1; line < y.length; line++) nearly(y[line] - y[line - 1], line >= 2 && line <= 4 ? tall : normal);
    const bracket = result.layout.attachments.at(-1)!;
    assert.deepEqual(bracket.regions.map(region => region.line), [2, 3, 4]);
    for (const region of bracket.regions) {
        const notes = result.layout.objects.filter(node => node.layoutLine === region.line && !node.T.isZero());
        assert.ok(notes.every(node => region.y + region.h < getLayoutBounds(node).y));
    }
    assert.equal(result.lowering.duration.toString(), bare.lowering.duration.toString());
    assert.deepEqual(result.layout.objects.map(node => node.ast.sourceSpan), bare.layout.objects.map(node => node.ast.sourceSpan));
    assert.deepEqual(result.diagnostics, []);
});

test('the two spacing bands persist through automatic pagination without page justification', () => {
    const options = { uniformSystemHeight: true, alignRelations: true };
    const continuous = compileScore(source, options), y = axes(continuous);
    const paged = compileScore(source.replace('width=800px', 'width=800px,height=220px'), options), p = axes(paged);
    assert.ok(paged.layout.pages.length >= 3);
    for (const page of paged.layout.pages) {
        for (let line = page.lineStart + 1; line < page.lineEnd; line++) nearly(p[line] - p[line - 1], y[line] - y[line - 1]);
    }
    assert.deepEqual(paged.layout.attachments.at(-1)!.regions.map(region => region.line), [2, 3, 4]);
});

test('a bracket on the upper voice does not change the distance between parallel voices', () => {
    const upper = music + ' @volta(a,b,1)';
    const lower = Array(8).fill('1, 2, 3, 4, |').join(' @br() ');
    const result = compileScore(`@page(width=800px) @voices(@voice({${upper}}),@voice({${lower}}))`, { uniformSystemHeight: true, alignRelations: true });
    const distances = Array.from({ length: 8 }, (_, line) => {
        const byTrack = new Map(result.layout.objects.filter(node => node.layoutLine === line && !node.T.isZero()).map(node => [node.track, node.box.y + node.box.visualAxis]));
        const values = [...byTrack.values()].sort((a, b) => a - b);
        assert.equal(values.length, 2);
        return values[1] - values[0];
    });
    for (const distance of distances) nearly(distance, distances[0]);
    assert.deepEqual(result.diagnostics, []);
});

test('paragraph groups share music height locally and ignore headings on other systems', () => {
    const music = '@page(width=800px,top=8px,bottom=8px) @spacing({1@a 2 3 4 | @br() 1 2 3 4 | @br() 1 2 3 4 |},group="A") @br() @spacing({1\'\' 2\'\' 3\'\' 4\'\' | @br() 1 2 3 4 | @br() 1 2 3 4 |},group="B")';
    const options = { uniformSystemHeight: true, alignRelations: true };
    const bare = compileScore(music, options);
    const named = compileScore(music + ' @text(段落标题,size=14px,above=a,local=true)', options);
    const natural = compileScore(music);
    const y = axes(named), b = axes(bare), n = axes(natural);
    nearly(y[2] - y[1], y[1] - y[0]);
    nearly(y[5] - y[4], y[4] - y[3]);
    assert.ok(y[4] - y[3] > y[1] - y[0] + 5);
    assert.ok(y[0] > b[0] + 10);
    nearly(y[2] - y[1], b[2] - b[1]);
    assert.ok(Math.abs(n[5] - n[4] - (y[5] - y[4])) > 5);
    assert.deepEqual(named.diagnostics, []);
    assert.equal(named.lowering.duration.toString(), bare.lowering.duration.toString());
    assert.equal(named.layout.objects.filter(node => !node.T.isZero()).length, 24);
});

test('paragraph height groups survive automatic pagination', () => {
    const music = '@page(width=800px,top=8px,bottom=8px) @spacing({1 2 3 4 | @br() 1 2 3 4 | @br() 1 2 3 4 |},group="A") @br() @spacing({1\'\' 2\'\' 3\'\' 4\'\' | @br() 1 2 3 4 | @br() 1 2 3 4 |},group="B")';
    const options = { uniformSystemHeight: true, alignRelations: true };
    const continuous = compileScore(music, options), y = axes(continuous);
    const paged = compileScore(music.replace('width=800px', 'width=800px,height=160px'), options), p = axes(paged);
    assert.ok(paged.layout.pages.length >= 2);
    for (const page of paged.layout.pages) for (let line = page.lineStart + 1; line < page.lineEnd; line++) nearly(p[line] - p[line - 1], y[line] - y[line - 1]);
    assert.deepEqual(paged.diagnostics, []);
});
