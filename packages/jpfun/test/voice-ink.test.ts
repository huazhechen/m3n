import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileScore } from '../src/pipeline.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import type { TextStyle } from '../src/render/types.js';
import { recordCommands, nearly } from './helpers.js';

// Deliberately different ink for M, CJK, descenders and bold row names.
const textMeasurer = { measureText(text: string, style: TextStyle) {
    const size = style.fontSize;
    const [ascent, descent] = text === 'M' ? [.1, .05] : text === '甲' ? [.9, .2]
        : text === 'gyp' ? [.3, .7] : text === '2.' ? [1.1, .05]
        : style.fontWeight === 600 ? [1.3, .1] : [.6, 0];
    return { w: text.length * size * .6, h: size * (ascent + descent), baseline: size * ascent };
} };
const compile = (source: string, size = 22) => {
    const result = compileScore(source, { variables: { fontsize: size }, textMeasurer });
    assert.deepEqual(result.diagnostics, []);
    return result;
};
const ink = (command: { text: string; x: number; y: number; style: TextStyle }) => {
    const m = textMeasurer.measureText(command.text, command.style);
    return { top: command.y - m.baseline, bottom: command.y - m.baseline + m.h };
};

for (const size of [11, 22, 33]) test(`lyrics pack actual CJK and descender ink at music size ${size}`, () => {
    const result = compile('@voice({1 2},,"甲 gyp","yo 中")', size);
    const texts = recordCommands(result.layout).filter(c => c.kind === 'text' && c.style.semantic?.role === 'lyric');
    const first = texts.filter(c => c.style.semantic?.row === 0), second = texts.filter(c => c.style.semantic?.row === 1);
    assert.equal(first.length, 2); assert.equal(second.length, 2);
    assert.ok(nearly(first[0].y, first[1].y) && nearly(second[0].y, second[1].y));
    const musicBottom = Math.max(...result.layout.objects.filter(n => !n.T.isZero()).map(n => { const b = getLayoutBounds(n); return b.y + b.h; }));
    assert.ok(nearly(Math.min(...first.map(c => ink(c).top)) - musicBottom, size * .32));
    assert.ok(nearly(Math.min(...second.map(c => ink(c).top)) - Math.max(...first.map(c => ink(c).bottom)), size * .24));
});

test('visit prefixes and bold lyric row names participate in their shared row envelope', () => {
    const prefixes = JSON.stringify(JSON.stringify({ '0:0': '2.' }));
    const result = compile(`@voice({1 2},Lead,Verse="甲 gyp",Other="yo 中",lyricprefixes=${prefixes})`);
    const texts = recordCommands(result.layout).filter(c => c.kind === 'text');
    const first = texts.filter(c => c.text === 'verse' || c.style.semantic?.row === 0);
    const second = texts.filter(c => c.text === 'other' || c.style.semantic?.row === 1);
    assert.equal(first.length, 4); assert.equal(second.length, 3);
    assert.ok(first.every(c => nearly(c.y, first[0].y)));
    assert.ok(second.every(c => nearly(c.y, second[0].y)));
    assert.ok(nearly(Math.min(...second.map(c => ink(c).top)) - Math.max(...first.map(c => ink(c).bottom)), 22 * .24));
});

test('underlines clear real descenders and the next row clears the painted stroke', () => {
    const result = compile('@voice({1 2},,"gyp 甲","yo 中",lyricunderlines="0:0")');
    const commands = recordCommands(result.layout);
    const line = commands.find(c => c.kind === 'line')!;
    assert.equal(line.kind, 'line');
    const texts = commands.filter(c => c.kind === 'text' && c.style.semantic?.role === 'lyric');
    const gyp = texts.find(c => c.text === 'gyp')!;
    const half = line.style!.strokeWidth! / 2;
    assert.ok(nearly(line.y1 - half - ink(gyp).bottom, gyp.style.fontSize * .1));
    const lowerTop = Math.min(...texts.filter(c => c.style.semantic?.row === 1).map(c => ink(c).top));
    assert.ok(nearly(lowerTop - (line.y1 + half), 22 * .24));
    const lyric = result.layout.attachments[0];
    assert.ok(lyric.regions.some(r => r.y <= line.y1 - half && nearly(r.y + r.h, line.y1 + half)));
});

test('each wrapped lyric system measures its own tier without inheriting another line ascent', () => {
    const result = compile('@voice({1 2 @br() 3 4},,"甲 gyp yo 中")');
    const texts = recordCommands(result.layout).filter(c => c.kind === 'text' && c.style.semantic?.role === 'lyric');
    const notes = result.layout.objects.filter(n => !n.T.isZero());
    for (const [start, end] of [[0, 2], [2, 4]]) {
        const bottom = Math.max(...notes.slice(start, end).map(n => { const b = getLayoutBounds(n); return b.y + b.h; }));
        assert.ok(nearly(Math.min(...texts.slice(start, end).map(c => ink(c).top)) - bottom, 22 * .32));
    }
});

test('framed parallel tracks stack complete measured lyric tiers on their shared owner', () => {
    const result = compile('@voice(@stack(@box({1 2},padding=4px),@box({3 4},padding=15px)),Lead,"甲 gyp yo 中",Row="yo 中 甲 gyp")');
    const texts = recordCommands(result.layout).filter(c => c.kind === 'text' && (c.style.semantic?.role === 'lyric' || c.text === 'row'));
    const groups = new Map<number, typeof texts>();
    for (const command of texts) {
        const tier = groups.get(command.y) ?? [];
        tier.push(command); groups.set(command.y, tier);
    }
    const tiers = [...groups].sort(([a], [b]) => a - b).map(([, tier]) => ({ top: Math.min(...tier.map(c => ink(c).top)), bottom: Math.max(...tier.map(c => ink(c).bottom)) }));
    assert.equal(tiers.length, 4);
    for (let i = 1; i < tiers.length; i++) assert.ok(nearly(tiers[i].top - tiers[i - 1].bottom, 22 * .24));
});

test('a wholly blank compact track does not reserve a phantom lyric block outside a shared frame', () => {
    const source = (slots: string) => `@voice(@box(@stack({1 2},{3 4}),padding=4px),Lead,"${slots} 甲 gyp",compactlyrics=true)`;
    const plain = compile(source('@ @'));
    const placeholders = compile(source('{\u200B} {\u200B}'));
    const gap = (result: typeof plain) => {
        const text = recordCommands(result.layout).find(c => c.kind === 'text' && c.text === '甲')!;
        assert.equal(text.kind, 'text');
        const note = result.layout.objects.find(n => 'name' in n && n.name === '3')!;
        return text.y - note.box.y;
    };
    assert.ok(nearly(gap(plain), gap(placeholders)));
});
