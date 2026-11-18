// @vitest-environment jsdom
import { parseM3NDocument,scoreEventIds } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { NumberedNotationScore } from './index.js';
const source = '{key=C}{2/4}{order=A,B,A@Db}\n===A\nN: 1 2 ||\nL1: 春天\nL2: 花开\n===B\nN: 3 4 ||';
describe('numbered keyed section visits', () => {
    it.each([320, 800])('centers two key rows together at normal key size at %spx', width => {
        const document = parseM3NDocument(source), before = structuredClone(document);
        const svg = NumberedNotationScore.create(document).render({ width, paged: false }).join('');
        const root = new DOMParser().parseFromString(svg, 'text/html');
        for (const prefix of ['1. 1=', '2. 1=']) {
            const text = [...root.querySelectorAll('text')].find(node => node.textContent === prefix)!;
            expect(text.getAttribute('font-size')).toBe('16');
            expect(text.getAttribute('font-family')).toBe('M3N Numbers');
        }
        expect(root.querySelectorAll('g.note')).toHaveLength(4);
        expect(document).toEqual(before);
    });
    it.each([320, 800])('expands fixed-do pitches and selects lyrics while preserving playback IDs and passes at %spx', width => {
        const document = parseM3NDocument(source), ids = scoreEventIds(document);
        const firstId = ids.get(document.parts.get('score')!.melody[0]!.events[0]!)!;
        const pages = NumberedNotationScore.create(document).render({ width, paged: false, fixedDo: true });
        const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
        const groups = [...root.querySelectorAll(`g.note[data-m3n-id="${firstId}"]`)];
        expect(groups.map(group => group.getAttribute('data-m3n-passes'))).toEqual(['1', '2']);
        expect(new Set([...root.querySelectorAll('[id]')].map(node => node.id)).size).toBe(root.querySelectorAll('[id]').length);
    });
});
