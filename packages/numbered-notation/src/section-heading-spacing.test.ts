import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { projectNativeScore } from './native-model.js';
it.each([false, true])('adds section space only for inline headings, standalone=%s', standalone => {
    const document = parseM3NDocument('{2/4}\n===A\nN: 1 2 ||\n===B' + (standalone ? '{br}' : '') + '\nN: 3 4 |||');
    const native = projectNativeScore(document, { textMeasurer: { measureText(text, style) {
                return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 };
            } } });
    expect(native.measures[1]!.extraGap).toBe(standalone ? 0 : 11.52);
});
