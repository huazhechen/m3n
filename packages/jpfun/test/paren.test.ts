import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore, type CompileScoreResult } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { compilePlayback } from '../src/playback/compile.js';
import { renderLayoutPagesToSvg } from '../src/render/svg.js';
import { attachmentCommands, compileValid, expectCompileError, nearly, playedNotes } from './helpers.js';

const parens = (result: CompileScoreResult, source: string) => result.layout.attachments.filter(attachment => attachment.sourceSpan
    && source.slice(attachment.sourceSpan.start, attachment.sourceSpan.end).startsWith('@paren('));

test('range parentheses enclose single notes, rests, folded chords and reversed endpoints', () => {
    for (const content of ['1@a', '0@a', '@div({1,,},2)@a', '@up(1,3,5)@a', '@grace(1,{2/ 3/})@a', '1@a 2 3@b']) {
        const source = `${content} @paren(${content.includes('@b') ? 'b,a' : 'a,a'})`;
        const result = compileValid(source);
        const [attachment] = parens(result, source);
        assert.equal(attachment.regions.length, 2);
        const notes = result.layout.objects.filter(node => !node.T.isZero());
        const bounds = notes.map(node => getLayoutBounds(node, true));
        const [left, right] = attachment.regions;
        assert.ok(left.x + left.w < Math.min(...bounds.map(box => box.x)));
        assert.ok(right.x > Math.max(...bounds.map(box => box.x + box.w)));
        assert.ok(left.y < Math.min(...bounds.map(box => box.y)));
        assert.ok(left.y + left.h > Math.max(...bounds.map(box => box.y + box.h)));
        assert.equal(attachmentCommands(attachment).filter(command => command.kind === 'path').length, 2);
        assert.ok(nearly(compileScore(result.ast.toString(source)).layout.bounds.h, result.layout.bounds.h));
    }
});

test('parentheses reserve both edges on every wrapped system and paginate with their notes', () => {
    for (const width of [320, 600]) for (const autoWrap of [false, true]) {
        const music = autoWrap ? `1@a 2 3 4 | ${Array(24).fill('1, 2/ 3 4 |').join(' ')} 1 2@b |`
            : '1@a 2 | @br(2) 3 4 | @pagebreak() 5 6@b |';
        const source = `@page(width=${width}px,height=200px,left=24px,right=24px,top=16px,bottom=16px) ${music} @paren(a,b)`;
        const result = compileValid(source, { autoWrap });
        const [attachment] = parens(result, source);
        const notes = result.layout.objects.filter(node => !node.T.isZero());
        const lines = [...new Set(notes.map(node => node.layoutLine))];
        assert.ok(lines.length >= 3);
        assert.ok(result.layout.pages.length > 1);
        assert.equal(attachment.regions.length, lines.length * 2);
        for (const line of lines) {
            const members = notes.filter(node => node.layoutLine === line);
            const [left, right] = attachment.regions.filter(region => region.line === line);
            assert.ok(left.x >= 24 - 1e-6);
            assert.ok(right.x + right.w <= width - 24 + 1e-6);
            assert.ok(left.x + left.w < Math.min(...members.map(node => node.box.x)));
            assert.ok(right.x > Math.max(...members.map(node => node.box.x + node.box.w)));
            const page = result.layout.pages.find(page => page.lineStart <= line && page.lineEnd > line)!;
            assert.ok(left.y >= page.bounds.y + 16 - 1e-6);
            assert.ok(left.y + left.h <= page.bounds.y + page.bounds.h - 16 + 1e-6);
        }
        const pages = renderLayoutPagesToSvg(result.layout);
        assert.equal((pages.join('').match(/<path /g) ?? []).length, lines.length * 2);
        const baseline = compileScore(source.replace(' @paren(a,b)', ''), { autoWrap });
        const playback = (result: CompileScoreResult) => playedNotes(compilePlayback(result.lowering))
            .map(note => [note.midi, note.start.toString(), note.duration.toString()]);
        assert.deepEqual(playback(result), playback(baseline));
    }
});

test('parentheses stay on their own staff and reject cross-track endpoints', () => {
    const source = '@voices(@voice({1@a 2@b}),@voice({3, 4,})) @paren(a,b)';
    const result = compileValid(source);
    const [attachment] = parens(result, source);
    const notes = result.layout.objects.filter(node => !node.T.isZero());
    const bass = notes.filter(node => node.track !== attachment.regions[0].track);
    assert.ok(attachment.box.y + attachment.box.h < Math.min(...bass.map(node => node.box.y)));
    expectCompileError('@voices(@voice({1@a}),@voice({3@b})) @paren(a,b)', 'E_PAREN_CROSS_TRACK');
});
