import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { layoutNativeScore } from './native-layout.js';
it.each([.45, .5, .55])('keeps a dense equal-measure bar out of sparse rows with glyph width %iem', factor => {
    const textMeasurer = { measureText(text: string, style: {
            fontSize: number;
        }) {
            return { w: [...text].reduce((sum, character) => sum + style.fontSize * (character.codePointAt(0)! > 127 ? 1 : factor), 0), h: style.fontSize, baseline: style.fontSize * .8 };
        } };
    const document = parseM3NDocument('{equal-measures=true}\n{4/4}\nN: {inst}1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e){/} | 1^^ |||\nL: 花');
    const options = { width: 320, paged: false, pageMargin: 11, minimumNoteGapEm: .5, textMeasurer };
    const native = layoutNativeScore(document, options);
    expect(native.systems.map(system => system.measures.map(measure => measure.index))).toEqual([[0], [1], [2]]);
});
it('balances unused capacity against the actual content width', () => {
    const textMeasurer = { measureText(text: string, style: {
            fontSize: number;
        }) {
            return { w: [...text].length * style.fontSize * .5, h: style.fontSize, baseline: style.fontSize * .8 };
        } };
    const document = parseM3NDocument('{4/4}\nN: (1 2 3 4 5 6 7 1e) | ((1 2 3 4 5 6 7 1e)) 2 3 | (1 2 3 4 5 6 7 1e) | (1 2 3 4 5 6 7 1e) | 1^^ |||');
    const options = { width: 320, paged: false, pageMargin: 11, minimumNoteGapEm: .5, textMeasurer };
    const native = layoutNativeScore(document, options);
    expect(native.systems.map(system => system.measures.map(measure => measure.index))).toEqual([[0], [1], [2], [3, 4]]);
    expect(native.systems.map(system => system.measures.reduce((beats, measure) => beats + measure.beats, 0))).toEqual([4, 4, 4, 8]);
});
