import { test } from 'node:test';
import { Fraction } from '../src/fraction.js';
import { layoutElement, layoutHorizontal } from '../src/layout/model.js';
import { assert, nearly } from './helpers.js';

for (const side of ['left', 'right']) for (const noteGap of [6, 12]) for (const reserveRatio of [0, .75]) {
    test(`compressed ${side} wall preserves spring force after gap=${noteGap} and reserve=${reserveRatio}`, () => {
        const box = { x: 0, w: 20, anchor: 10 };
        const element = layoutElement({ alpha_L: side === 'left' ? 1 : 20, alpha_R: side === 'right' ? 1 : 20,
            beta_L: 1, beta_R: 1, mu_L: 16, mu_R: 16 }, box,
            { t: new Fraction(0), T: new Fraction(1), track: 0 }, 1, noteGap);
        if (side === 'left') element.margin_L *= 1 - reserveRatio;
        else element.margin_R *= 1 - reserveRatio;
        const small = side === 'left' ? element.margin_L : element.margin_R;
        const large = side === 'left' ? element.margin_R : element.margin_L;
        // There are 3px of free space. One ordinary spring stays compressed
        // while the opposite wall is penetrated; equilibrium balances the
        // remaining spring rest lengths against the wall's 16 * 32 stiffness.
        const penetration = (small - (large - 3)) / (16 * 32 + 1);
        const expected = side === 'left' ? penetration : 3 - penetration;
        layoutHorizontal([[element]], 23, { eps: 1e-10 });
        assert(nearly(box.x, expected), `wall equilibrium must use current margins: ${box.x} vs ${expected}`);
    });
}
