import type { Rect, PageConfig } from './types.js';
import { PageLayoutError, type DocumentLayoutPage } from './page.js';

/** Painted primitive envelopes, relative to the main music axis of each line. */
export type SystemInkProfile = readonly Rect[];

/** Pack whole systems against horizontally overlapping ink, including earlier
 * systems whose tall decorations can reach past an intervening sparse line. */
export function paginateInkSystems(profiles: readonly SystemInkProfile[], page: PageConfig,
    coreGap: number, inkGap: number,
    pageBreaks: readonly (boolean | undefined)[] = [], extraGaps: readonly number[] = [],
    coreExtents: readonly { top: number; bottom: number }[] = []) {
    const pages: DocumentLayoutPage[] = [], baselines: number[] = [];
    let start = 0, pageTop = 0, bottom = page.marginTop;
    const placed: { baseline: number; core: { top: number; bottom: number }; regions: SystemInkProfile }[] = [];
    const close = (end: number) => {
        const height = Number.isFinite(page.height) ? page.height : bottom + page.marginBottom;
        pages.push({ bounds: { x: 0, y: pageTop, w: page.width, h: height }, autoHeight: !Number.isFinite(page.height), lineStart: start, lineEnd: end });
        pageTop += height; start = end; bottom = page.marginTop; placed.length = 0;
    };
    for (let i = 0; i < profiles.length; i++) {
        const regions = profiles[i];
        const top = Math.min(0, ...regions.map(r => r.y));
        const lower = Math.max(0, ...regions.map(r => r.y + r.h));
        if (lower - top > page.height - page.marginTop - page.marginBottom + 1e-6)
            throw new PageLayoutError(i, lower - top, page.height - page.marginTop - page.marginBottom);
        if (i > start && pageBreaks[i] !== undefined) close(i);
        const core = coreExtents[i] ?? { top, bottom: lower };
        let baseline = page.marginTop - top;
        if (placed.length) {
            baseline = Math.max(baseline, placed.at(-1)!.baseline + placed.at(-1)!.core.bottom - core.top + coreGap);
            for (const previous of placed) for (const upper of previous.regions) for (const next of regions) {
                if (Math.min(upper.x + upper.w, next.x + next.w) > Math.max(upper.x, next.x))
                    baseline = Math.max(baseline, previous.baseline + upper.y + upper.h + inkGap - next.y);
            }
            baseline += extraGaps[i] ?? 0;
        }
        if (i > start && baseline + lower > page.height - page.marginBottom + 1e-6) {
            close(i); baseline = page.marginTop - top;
        }
        baselines.push(pageTop + baseline);
        placed.push({ baseline, regions, core }); bottom = Math.max(bottom, baseline + lower);
    }
    if (profiles.length > start) close(profiles.length);
    return { pages, baselines };
}
