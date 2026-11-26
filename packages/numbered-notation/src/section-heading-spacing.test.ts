import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { projectNativeScore } from './native-model.js';
it.each([[false, 0.8], [false, 1.2], [false, 2], [true, 1.2]])('sets 1.5em core clearance only for inline headings, standalone=%s, leading=%s', (standalone, leading) => {
    const document = parseM3NDocument('{leading=' + leading + '}{2/4}\n===A\nN: 1 2 ||\n===B' + (standalone ? '{br}' : '') + '\nN: 3 4 |||');
    const native = projectNativeScore(document, { textMeasurer: { measureText(text, style) {
                return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 };
            } } });
    expect(native.measures[1]!.coreGapBefore).toBe(standalone ? undefined : 36);
});
