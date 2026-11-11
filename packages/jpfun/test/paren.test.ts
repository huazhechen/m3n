import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore, type CompileScoreResult } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { compilePlayback } from '../src/playback/compile.js';
import { renderLayoutPagesToSvg } from '../src/render/svg.js';
import { attachmentCommands, compileValid, expectCompileError, nearly, playedNotes, recordCommands } from './helpers.js';

const parens = (result: CompileScoreResult, source: string) => result.layout.attachments.filter(attachment => attachment.sourceSpan
    && source.slice(attachment.sourceSpan.start, attachment.sourceSpan.end).startsWith('@paren('));

test('ordinary range parentheses bracket single notes, rests, folded chords and reversed endpoints', () => {
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
        const commands = attachmentCommands(attachment);
        assert.deepEqual(commands.map(command => command.kind === 'text' && command.text), ['(', ')']);
        for (const region of attachment.regions) assert.equal(region.h, notes[0].ast.size);
        assert.ok(nearly(compileScore(result.ast.toString(source)).layout.bounds.h, result.layout.bounds.h));
    }
});

test('parentheses share the numeric font, size and baseline without stretching around decorations', () => {
    for (const content of ['1@a 2@b', "1''@a 2,,@b", '@div({1,,},4)@a 2@b', '@up(1,3,5)@a 2@b']) {
        const source = `@set(fontsize=30,numberfont="Test Numbers") ${content} @paren(a,b)`;
        const result = compileValid(source, { textMeasurer: {
            measureText: (text, style) => ({ w: text === '(' ? 7 : text === ')' ? 9 : 15, h: style.fontSize, baseline: style.fontSize * 0.7 }),
        } });
        const [attachment] = parens(result, source);
        const commands = recordCommands(result.layout).filter(command => command.kind === 'text');
        const number = commands.find(command => command.text === '2')!;
        const brackets = commands.filter(command => command.text === '(' || command.text === ')');
        assert.equal(brackets.length, 2);
        for (const bracket of brackets) {
            assert.equal(bracket.style.fontFamily, number.style.fontFamily);
            assert.equal(bracket.style.fontSize, number.style.fontSize);
            assert.ok(nearly(bracket.y, number.y));
        }
        const notes = result.layout.objects.filter(node => !node.T.isZero());
        const [left, right] = attachment.regions;
        assert.equal(left.w, 7);
        assert.equal(right.w, 9);
        assert.ok(nearly(getLayoutBounds(notes[0], true).x - left.x - left.w, 1.5));
        const last = getLayoutBounds(notes.at(-1)!, true);
        assert.ok(nearly(right.x - last.x - last.w, 1.5));
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
        assert.equal((pages.join('').match(/>\(<\/text>/g) ?? []).length, lines.length);
        assert.equal((pages.join('').match(/>\)<\/text>/g) ?? []).length, lines.length);
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
