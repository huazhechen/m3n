// @vitest-environment jsdom
import { parseM3NDocument,scoreEventIds } from '@m3n/notation';
import { expect,it } from 'vitest';
import { NumberedNotationScore,type NumberedNotationRenderOptions } from './index.js';
it('uses the native engine at the public entry without a reference engine', () => {
    const document = parseM3NDocument('{key=D}{2/4}\nN: ||: 1 2 | 3 4 :|||\nL: 甲乙丙丁');
    const before = structuredClone(document);
    const options: NumberedNotationRenderOptions = { width: 320, paged: true, fixedDo: true, transpose: 1, measureNumbers: true };
    const score = NumberedNotationScore.create(document);
    const pages = score.render(options);
    expect(pages.length).toBeGreaterThan(0);
    for (const svg of pages)
        expect(svg).toContain('data-engine="m3n"');
    const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
    for (const id of scoreEventIds(document).values())
        expect(root.querySelector(`[data-m3n-id="${id}"]`)).not.toBeNull();
    expect(root.querySelector('[data-m3n-role="pitch-range-low"]')).not.toBeNull();
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(document).toEqual(before);
});
