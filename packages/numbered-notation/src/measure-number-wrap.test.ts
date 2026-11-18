// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseM3NDocument } from '@m3n/notation';
import { expect, it } from 'vitest';
import { NumberedNotationScore } from './index.js';
const sources = [
    '{equal-measures=true}\n{4/4}\nN: 1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e) | 1^^ |||\nB: 1d^^ | 5d^^ | 1d^^ |',
    ...['guo_huo_01.m3n', 'ming_tian_hui_geng_hao_01.m3n', 'wo_yao_ni_01.m3n', 'xing_xing_dian_deng_01.m3n']
        .map(file => readFileSync(resolve(process.cwd(), '../../src/scores', file), 'utf8')),
];
it.each(sources.map((source, index) => ({ source, index })))('keeps existing automatic rows when numbering case $index', ({ source }) => {
    const document = parseM3NDocument(source);
    const systems = (measureNumbers: boolean) => {
        const textMeasurer = { measureText(text: string, style: {
                fontSize: number;
            }) {
                return { w: [...text].reduce((sum, character) => sum + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : .5), 0), h: style.fontSize, baseline: style.fontSize * .8 };
            } };
        const svg = NumberedNotationScore.create(document).render({ width: 320, paged: false, pageMargin: 11, textMeasurer, measureNumbers });
        const root = new DOMParser().parseFromString(svg.join(''), 'text/html');
        return [...root.querySelectorAll('g.system')].map(system => [...system.querySelectorAll('g.note')].map(note => note.getAttribute('data-m3n-id'))).filter(notes => notes.length);
    };
    expect(systems(true)).toEqual(systems(false));
});
