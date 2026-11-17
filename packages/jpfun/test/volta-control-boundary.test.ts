import { test } from 'node:test';
import { ANCHOR_KEY } from '../src/functions/temporal.js';
import { assert, attachmentCommands, layoutOf, nearly } from './helpers.js';

for (const size of [16, 22, 32]) {
    for (const controls of ['@meter(6,8)', '@text("1=G")', '@meter(6,8) @symbol(segno) @text("1=G")']) {
        test(`ending boundaries include zero-time controls at ${size}px: ${controls}`, () => {
            const layout = layoutOf(`1 | ${controls} 2@a 3@b ${controls} | 4 @volta(a,b,1)`, size);
            const bars = layout.objects.filter(node => node.mergeKey === ANCHOR_KEY);
            const top = attachmentCommands(layout.attachments[0]).find(command => command.kind === 'line');
            assert(top?.kind === 'line' && bars.length === 2, 'expected bracket and two boundary bars');
            assert(nearly(top.x1, bars[0].box.x + bars[0].box.anchor + size * 5 / 22),
                'the first hook must follow the actual preceding bar, including controls inside the ending');
            assert(nearly(top.x2, bars[1].box.x + bars[1].box.anchor),
                'the closing hook must reach the actual following bar across zero-time controls');
        });
    }
    test(`boundary lookup stops at intervening music at ${size}px`, () => {
        const layout = layoutOf('1 | @meter(6,8) 2 3@a 4@b 5 @meter(4,4) | 6 @volta(a,b,1)', size);
        const top = attachmentCommands(layout.attachments[0]).find(command => command.kind === 'line');
        const music = layout.objects.filter(node => !node.T.isZero());
        assert(top?.kind === 'line', 'expected bracket');
        assert(top.x1 > music[1].box.x + music[1].box.w,
            'the left endpoint must not cross the preceding note to find a bar');
        assert(top.x2 < music[4].box.x,
            'the right endpoint must not cross the following note to find a bar');
    });
}
