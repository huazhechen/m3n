// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { nativeBarMetrics } from './native-horizontal.js';
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
const measurer: TextMeasurer = { measureText(text, style) {
        return { w: [...text].length * style.fontSize * .58, h: style.fontSize, baseline: style.fontSize * .8 };
    } };
const cases = [
    ['mixed densities', '{4/4}\nN: (1 2 3 4 5 6 7 1e) | 2 3 4 5 | 1^^ |||'],
    ['shared repeat boundary', '{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e | 2 3 4 5 :||'],
    ['navigation before the final bar', '{4/4}\nN: 1 2 3 4 | 5 6 7 1e {fine} |||'],
    ['parallel bass', '{4/4}\nN: 1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e) | 1^^ |||\nB: 1d^^ | 5d^^ | 1d^^ |||'],
    ['parentheses and lyrics', '{4/4}\nN: {inst}1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e){/} | 1^^ |||\nL: 春风吹过山林间的花儿开了'],
] as const;
describe('native equal-measure interior spacing', () => {
    it('places the visible bar anchors at equal intervals with the complete final bar inside the margin', () => {
        const layout = layoutNativeScore(parseM3NDocument('{equal-measures=true}{4/4}\nN: 1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e) | 1^^ |||'), { width: 800, paged: false, textMeasurer: measurer });
        const bar = nativeBarMetrics('end'), right = bar.width - bar.anchor;
        const cell = (800 - 64 - right) / 3;
        const measures = layout.systems[0]!.measures;
        expect(measures).toHaveLength(3);
        measures.forEach((measure, index) => expect(measure.barX).toBeCloseTo(32 + (index + 1) * cell, 6));
        expect(measures.at(-1)!.barX! + right).toBeCloseTo(768, 6);
    });
});

it.each(cases)('keeps equal visible boundaries and all music for %s', (_name, source) => {
    for (const width of [320, 800]) {
        const layout = layoutNativeScore(parseM3NDocument(source), {width,paged:false,equalMeasures:true,textMeasurer:measurer,minimumNoteGap:8});
        expect(layout.projection.glyphs.length).toBeGreaterThan(0);
        for (const system of layout.systems) {
            const bars = system.measures.map(m => m.barX).filter((x): x is number => x !== undefined);
            const gaps = bars.slice(1).map((x,i) => x - bars[i]!);
            if (gaps.length > 1) for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 3);
            expect(system.measures.every(m => m.start >= 32 - .001)).toBe(true);
        }
    }
});
