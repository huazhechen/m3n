import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { chromium } from '@playwright/test';
let browser, page;
before(async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    page = await browser.newPage();
    await page.setContent('<main><div id="ref"></div><div id="native"></div></main>');
    await page.addScriptTag({ content: readFileSync(new URL('./lib/numbered-primitive-metrics.mjs', import.meta.url), 'utf8').replaceAll('export function', 'function') });
});
after(async () => { await browser?.close(); });
for (const [name, ref, native, expected] of [
    ['translated primitives', '<svg><circle cx="10.25" cy="20.5" r="2"/><rect x="10" y="20" width="3" height="4"/></svg>', '<svg><g transform="translate(10 20)"><circle cx=".25" cy=".5" r="2"/><rect width="3" height="4"/></g></svg>', 'equal'],
    ['relative curves', '<svg><path d="M10.25 20.5 L11.25 20.5 L11.25 22.5 Q12.25 23.5 13.25 22.5 C14.25 21.5 15.25 23.5 16.25 22.5 Z"/></svg>', '<svg><g transform="translate(10 20)"><path d="m.25 .5 h1 v2 q1 1 2 0 c1 -1 2 1 3 0 z"/></g></svg>', 'equal'],
    ['viewport origin', '<svg viewBox="0 100 100 100"><circle cx="10" cy="120" r="2"/></svg>', '<svg viewBox="0 0 100 100"><circle cx="10" cy="20" r="2"/></svg>', 'equal'],
    ['no-ink text', '<svg><text>\u200b</text></svg>', '<svg/>', 'equal'],
    ['changed radius', '<svg><circle cx="10" cy="20" r="2"/></svg>', '<svg><circle cx="10" cy="20" r="2.01"/></svg>', 'different'],
    ['changed paint', '<svg><circle cx="10" cy="20" r="2" fill="red"/></svg>', '<svg><circle cx="10" cy="20" r="2" fill="blue"/></svg>', 'different'],
    ['missing primitive', '<svg><circle r="2"/></svg>', '<svg/>', 'different'],
    ['shifted bracket', '<svg><path d="M10 10 V5 H50 V10" fill="none" stroke="black"/></svg>', '<svg><path d="M13 10 V5 H53 V10" fill="none" stroke="black"/></svg>', 'different'],
    ['shifted text', '<svg><text x="10" y="20">1.</text></svg>', '<svg><text x="10.1" y="20">1.</text></svg>', 'different'],
    ['inherited text anchor', '<svg><text x="20" y="20" text-anchor="middle">A</text></svg>', '<svg text-anchor="middle"><text x="20" y="20">A</text></svg>', 'equal'],
])
    test(name, async () => {
        const result = await page.evaluate(({ ref, native }) => {
            document.getElementById('ref').innerHTML = ref;
            document.getElementById('native').innerHTML = native;
            return compareNumberedPrimitives(...['ref', 'native'].map(id => captureNumberedPrimitives(document.getElementById(id))));
        }, { ref, native });
        assert.equal(!result.missing.length && !result.extra.length && !result.different.length, expected === 'equal');
    });
for (const svg of ['<svg><g transform="scale(2)"><circle r="2"/></g></svg>', '<svg><path d="M0 0 A2 2 0 0 1 3 3"/></svg>', '<svg><polygon points="0,0 10,0 0,10"/></svg>'])
    test('rejects unsupported geometry: ' + svg, async () => {
        await assert.rejects(page.evaluate(svg => {
            const root = document.getElementById('ref');
            root.innerHTML = svg;
            return captureNumberedPrimitives(root);
        }, svg), /unsupported/);
    });
