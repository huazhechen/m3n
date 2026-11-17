import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { paintedNodeRegions } from '../src/layout/painted-ink.js';
import { attachmentCommands, layoutContext, recordCommands } from './helpers.js';

for (const acc of ['b', '#', 'n', 'bb']) test(`display-only ${acc} note reserves painted side ink and the complete numeral body`, () => {
    const measurer = { measureText: (text: string, style: import('../src/render/types.js').TextStyle) =>
        ({ w: style.fontSize * .5, h: style.fontSize * .7, baseline: style.fontSize * .7 }) };
    const result = compileScore(`@note("${acc}2''",displayonly=true)`, { textMeasurer: measurer });
    assert.deepEqual(result.diagnostics, []);
    const node = result.layout.objects[0];
    const ink = paintedNodeRegions(node, measurer);
    const left = Math.min(node.box.x + node.ports['body.left'].x, ...ink.map(piece => piece.x));
    assert.ok(Math.abs(left - node.box.x) < 1e-6, 'no unused accidental design bearing before a display-only note');
    assert.ok(Math.abs(node.ports['body.right'].x - node.ports['body.left'].x - 11) < 1e-6,
        'preserve the complete numeral body rather than fitting a narrow visible digit');
});

test('a side accidental outside a tuplet does not raise the whole bracket', () => {
    const measurer = { measureText(text: string, style: import('../src/render/types.js').TextStyle) {
        const height = style.fontSize * .68;
        return { w: style.fontSize * .5 * text.length, h: height, baseline: height, inkBottom: height };
    } };
    const bracketTop = (acc: string) => {
        const result = compileScore(`@tuplet({${acc}1 2 3},2)`, { textMeasurer: measurer });
        assert.deepEqual(result.diagnostics, []);
        const bracket = result.layout.attachments.find(a => attachmentCommands(a).some(c => c.kind === 'text' && c.text === '3'))!;
        return bracket.box.y - result.layout.objects[0].box.y;
    };
    for (const accidental of ['b', 'n']) assert.ok(Math.abs(bracketTop(accidental) - bracketTop('')) < 1e-6);
});

test('cross-system continuation starts at musical heads, then clears actual side ink', () => {
    const measurer = { measureText(text: string, style: import('../src/render/types.js').TextStyle) {
        const height = style.fontSize * .68;
        return { w: style.fontSize * .5 * text.length, h: height, baseline: height, inkBottom: height };
    } };
    const middleTop = (content: string) => {
        const result = compileScore(`1@a @br() ${content} @br() 3@b @tie(a,b)`,
            { textMeasurer: measurer, alignRelations: true });
        assert.deepEqual(result.diagnostics, []);
        const host = result.layout.objects.find(node => node.layoutLine === 1 && !node.T.isZero())!;
        const middle = result.layout.attachments.flatMap(a => a.regions).find(region => region.line === 1)!;
        return middle.y - host.box.y;
    };
    for (const content of ['b2', '2 |', 'b2 |']) assert.ok(Math.abs(middleTop(content) - middleTop('2')) < 1e-6);
});

for (const size of [18, 22, 30]) {
    test(`accidental ink belongs to complete note and grace occupancy at ${size}px`, () => {
        for (const acc of ['#', 'b', 'n', '##', 'bb', '#bn']) {
            for (const name of ['4', "4'", '4,']) {
                for (const content of [
                    `@note("${acc}${name}")`,
                    `@grace({5},{@div({@note("${acc}${name}")},1)})`,
                    `@up({@note("${acc}${name}")},{6})`,
                ]) {
                    const source = `@set(fontsize=${size}) ${content}`;
                    const result = compileScore(source, { textMeasurer: layoutContext.textMeasurer });
                    assert.deepEqual(result.diagnostics, [], source);
                    assert.equal(result.layout.objects[0].ast.size, size);
                    for (const node of result.layout.objects) {
                        const box = getLayoutBounds(node, true);
                        for (const ink of paintedNodeRegions(node, layoutContext.textMeasurer)) {
                            assert.ok(ink.y >= box.y - 1e-6 && ink.y + ink.h <= box.y + box.h + 1e-6,
                                `${source}: ink ${JSON.stringify(ink)} outside ${JSON.stringify(box)}`);
                        }
                    }
                }
            }
        }
    });

    test(`accidental occupancy preserves body ports and octave/beam placement at ${size}px`, () => {
        const render = (acc: string) => compileScore(`@set(fontsize=${size}) @note("${acc}4'") @div({@note("${acc}5,")},2)`,
            { textMeasurer: layoutContext.textMeasurer }).layout;
        const plain = render('');
        for (const acc of ['#', 'b', 'n', '##']) {
            const marked = render(acc);
            for (let i = 0; i < plain.objects.length; i++) {
                const a = plain.objects[i], b = marked.objects[i];
                assert.equal(a.box.visualAxis, b.box.visualAxis);
                assert.equal(a.ports['tie.top']?.y ?? getLayoutBounds(a, true).y - a.box.y,
                    b.ports['tie.top']?.y ?? getLayoutBounds(b, true).y - b.box.y);
                for (const port of ['shoulder', 'body.left', 'body.right', 'body.bottom', 'decoration.below']) {
                    assert.equal(a.ports[port]?.y, b.ports[port]?.y, port);
                }
            }
            const relative = (layout: typeof plain) => recordCommands(layout).filter(c => c.kind === 'circle' || c.kind === 'line')
                .map(c => c.kind === 'circle' ? ['circle', c.cy - layout.objects[0].box.y, c.r]
                    : c.kind === 'line' ? ['line', c.y1 - layout.objects[0].box.y, c.y2 - layout.objects[0].box.y] : []);
            assert.deepEqual(relative(marked), relative(plain));
        }
    });
}
