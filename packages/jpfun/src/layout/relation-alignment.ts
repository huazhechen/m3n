// M3N addition: semantic adjacency, independent of pixel spacing and pagination.
import { isVisualTemporalNode } from '../functions/temporal.js';
import type { LayoutAttachment } from './types.js';

export function adjacentRelationGroups(attachments: readonly LayoutAttachment[]) {
    const spans = attachments.flatMap(attachment => {
        const nodes = attachment.endPoints?.filter(isVisualTemporalNode);
        if (!attachment.alignmentKind || !nodes?.length || nodes.some(node => node.track !== nodes[0].track)) return [];
        const sorted = [...nodes].sort((a, b) => a.t.compare(b.t));
        const first = sorted[0], last = sorted[sorted.length - 1];
        return [{ attachment, first, last, start: first.t,
            end: last.t.clone().add(attachment.alignmentKind === 'tie' ? 0 : last.T) }];
    });
    const groups = new Map<LayoutAttachment, readonly LayoutAttachment[]>();
    const pending = new Set(spans);
    for (const span of spans) {
        if (!pending.has(span)) continue;
        const family = spans.filter(other => other.attachment.alignmentKind === span.attachment.alignmentKind && other.first.track === span.first.track);
        const depth = (item: typeof span) => family.filter(other => other.start.compare(item.start) <= 0 && other.end.compare(item.end) >= 0
            && (other.start.compare(item.start) < 0 || other.end.compare(item.end) > 0)).length;
        const level = depth(span);
        const siblings = family.filter(other => depth(other) === level).sort((a, b) => a.start.compare(b.start));
        let chain: typeof siblings = [];
        const close = () => {
            const members = chain.map(item => item.attachment);
            for (const item of chain) { groups.set(item.attachment, members); pending.delete(item); }
            chain = [];
        };
        for (const item of siblings) {
            const previous = chain[chain.length - 1];
            if (previous && !previous.end.equals(item.start)
                && !(span.attachment.alignmentKind === 'tie' && previous.last.t.clone().add(previous.last.T).equals(item.first.t))) close();
            chain.push(item);
        }
        close();
    }
    return groups;
}
