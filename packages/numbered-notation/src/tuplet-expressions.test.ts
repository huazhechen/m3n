// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,expect,it } from 'vitest';
import { layoutNativeScore } from './native-layout.js';
import { nativeStyle } from './native-style.js';
const variants = [320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged })));
describe('tuplet expressions remain outside rhythm brackets in the native renderer', () => {
    it.each(variants)('orders every Clarinet Polka tuplet dynamic at width $width, paged=$paged', options => {
        const source = readFileSync(resolve('../../src/scores/dan_huang_guan_bo_er_ka_01.m3n'), 'utf8');
        const document = parseM3NDocument(source);
        const native = layoutNativeScore(document, options);
        let checked = 0;
        for (const system of native.systems)
            for (const relation of system.relations.filter(r => r.kind === 'tuplet')) {
                const glyph = relation.first;
                for (const mark of glyph.markLayout?.filter(m => /^(p{1,3}|f{1,3}|mp|mf)$/.test(m.name)) ?? []) {
                    checked++;
                    expect(mark.top + mark.height).toBeLessThanOrEqual(system.relationLayout!.get(relation)!.ink.top - (nativeStyle.music * .12) + .001);
                }
            }
        expect(checked).toBeGreaterThan(0);
    });
});
