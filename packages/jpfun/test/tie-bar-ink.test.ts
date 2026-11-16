import { test } from 'node:test';
import { compileValid, assert, attachmentCommands, recordCommands } from './helpers.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import type { TextMeasurer } from '../src/render/types.js';

const measurer: TextMeasurer = { measureText(text) {
    const w = text === 'LABEL' ? 140 : 10;
    return { w, advance: w, h: 10, baseline: 8, inkLeft: 0, inkRight: w };
} };

for (const position of ['inside', 'after']) test(`ties clear painted zero-time bar labels ${position} their endpoint interval`, () => {
    const bar = '@up({|},@text(LABEL,size=10px,align=center))';
    const source = position === 'inside' ? `1@a ${bar} 2@b @tie(a,b,height=22px)` : `1@a 2@b ${bar} @tie(a,b,height=22px)`;
    const { layout } = compileValid(source, { textMeasurer: measurer, alignRelations: true });
    const label = recordCommands(layout).find(command => command.kind === 'text' && command.text === 'LABEL')!;
    const text = paintedCommandRegions(label, measurer)[0];
    const tie = attachmentCommands(layout.attachments[0]).find(command => command.kind === 'path')!;
    const curve = paintedCommandRegions(tie, measurer)[0];
    assert(text.x <= curve.x && text.x + text.w >= curve.x + curve.w, 'the label must cover the complete horizontal arc span');
    assert(curve.y + curve.h <= text.y + 1e-6, 'the complete ribbon must clear the earlier bar-label ink');
});
