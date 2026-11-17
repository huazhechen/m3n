import { test } from 'node:test';
import { GraceTemporal } from '../src/functions/grace/index.js';
import type { VisualTemporalNode } from '../src/functions/temporal.js';
import { getLayoutBounds } from '../src/layout/engine.js';
import { assert, layoutOf, nearly } from './helpers.js';

for (const size of [16, 22, 32]) for (const chord of ['@up(4,#5,1\')', '@up(4,5,#1\')']) {
    test(`leading grace clears every musical chord member at ${size}px: ${chord}`, () => {
        const result = layoutOf(`@set(fontsize=${size}) @grace(${chord},{4/})`);
        const grace = result.objects[0] as GraceTemporal;
        const host = grace.host as VisualTemporalNode & { members: readonly VisualTemporalNode[] };
        const left = Math.min(...host.members.filter(member => !member.T.isZero()).map(member => member.box.x));
        const graceRight = Math.max(...grace.graces.map(note => {
            const ink = getLayoutBounds(note, true);
            return ink.x + ink.w;
        }));
        assert(nearly(left - graceRight, size * .7 * .2),
            `grace must keep its side gap outside the complete chord: ${left - graceRight}`);
    });
}
