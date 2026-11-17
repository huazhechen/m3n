// Diagnostic SVG geometry audit. It does not redefine strict pixel equality.
// Fail on unsupported transforms/paths rather than silently losing geometry.
export function captureNumberedPrimitives(root) {
    if (root.querySelector('use,image,polygon,polyline,foreignObject'))
        throw Error('unsupported SVG primitive');
    const ctx = document.createElement('canvas').getContext('2d');
    return [...root.querySelectorAll('svg')].flatMap((svg, page) => [...svg.querySelectorAll('path,line,rect,circle,ellipse,text')].filter(e => !e.closest('defs')).map(e => {
        let dx = -svg.viewBox.baseVal.x, dy = -svg.viewBox.baseVal.y;
        for (let p = e; p && p !== svg; p = p.parentElement) {
            const t = p.getAttribute('transform');
            if (!t)
                continue;
            const m = t.match(/^translate\(\s*([-+.\deE]+)[ ,]+([-+.\deE]+)\s*\)$/);
            if (!m)
                throw Error('unsupported transform ' + t);
            dx += Number(m[1]);
            dy += Number(m[2]);
        }
        let inkEmpty = false;
        const s = getComputedStyle(e), num = a => { const value = Number(e.getAttribute(a) || 0); if (!Number.isFinite(value)) throw Error('unsupported numeric attribute ' + a); return value; }, kind = e.tagName === 'line' ? 'path' : e.tagName, ops = [], coordinates = [];
        let key = { page, kind, fill: kind === 'line' ? 'none' : s.fill, stroke: s.stroke, strokeWidth: s.stroke === 'none' ? 0 : parseFloat(s.strokeWidth), cap: s.stroke === 'none' ? '' : s.strokeLinecap, join: s.stroke === 'none' ? '' : s.strokeLinejoin, fillRule: s.fillRule, opacity: s.opacity, fillOpacity: s.fillOpacity, strokeOpacity: s.strokeOpacity, dash: s.stroke === 'none' ? '' : s.strokeDasharray, dashOffset: s.stroke === 'none' ? '' : s.strokeDashoffset, visibility: s.visibility, display: s.display };
        if (e.tagName === 'text') {
            ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
            const metrics = ctx.measureText(e.textContent), advance = metrics.width, anchor = s.textAnchor, offset = anchor === 'middle' ? advance / 2 : anchor === 'end' ? advance : 0;
            inkEmpty = metrics.actualBoundingBoxLeft === 0 && metrics.actualBoundingBoxRight === 0 && metrics.actualBoundingBoxAscent === 0 && metrics.actualBoundingBoxDescent === 0;
            key = { ...key, text: e.textContent, font: ctx.font, letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing };
            coordinates.push(num('x') - offset + dx, num('y') + dy);
        }
        else if (e.tagName === 'path') {
            const tokens = e.getAttribute('d').match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gi) || [];
            let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = '';
            const val = () => { const v = Number(tokens[i++]); if (!Number.isFinite(v))
                throw Error('bad path'); return v; };
            while (i < tokens.length) {
                if (/^[a-z]$/i.test(tokens[i]))
                    cmd = tokens[i++];
                const op = cmd.toUpperCase(), ox = cmd === op ? 0 : x, oy = cmd === op ? 0 : y;
                if (op === 'Z') {
                    ops.push('Z');
                    x = sx;
                    y = sy;
                    cmd = '';
                    continue;
                }
                if (op === 'M' || op === 'L') {
                    x = val() + ox;
                    y = val() + oy;
                    ops.push(op);
                    coordinates.push(x + dx, y + dy);
                    if (op === 'M') {
                        sx = x;
                        sy = y;
                        cmd = cmd === 'M' ? 'L' : 'l';
                    }
                }
                else if (op === 'H') {
                    x = val() + ox;
                    ops.push('L');
                    coordinates.push(x + dx, y + dy);
                }
                else if (op === 'V') {
                    y = val() + oy;
                    ops.push('L');
                    coordinates.push(x + dx, y + dy);
                }
                else if (op === 'C' || op === 'Q') {
                    ops.push(op);
                    for (let j = 0; j < (op === 'C' ? 3 : 2); j++) {
                        x = val() + ox;
                        y = val() + oy;
                        coordinates.push(x + dx, y + dy);
                    }
                }
                else
                    throw Error('unsupported path ' + cmd);
            }
        }
        else if (e.tagName === 'line') {
            ops.push('M', 'L');
            coordinates.push(num('x1') + dx, num('y1') + dy, num('x2') + dx, num('y2') + dy);
            key.fill = 'none';
        }
        else if (e.tagName === 'rect') {
            const r = e.getBBox(), dimension = a => e.getAttribute(a)?.includes('%') ? r[a] : num(a);
            const x = num('x') + dx, y = num('y') + dy, width = dimension('width'), height = dimension('height');
            if (!num('rx') && !num('ry')) {
                // The same filled/stroked rectangle may be emitted as a path.
                key.kind = 'path';
                ops.push('M', 'L', 'L', 'L', 'Z');
                coordinates.push(x, y, x + width, y, x + width, y + height, x, y + height);
            } else coordinates.push(x, y, width, height, num('rx'), num('ry'));
        }
        else if (e.tagName === 'circle' || e.tagName === 'ellipse') {
            coordinates.push(num('cx') + dx, num('cy') + dy, num(e.tagName === 'circle' ? 'r' : 'rx'), num(e.tagName === 'circle' ? 'r' : 'ry'));
        }
        const box = e.getBBox();
        key.ops = ops.join('');
        return { key: JSON.stringify(key), coordinates, inkEmpty, center: [box.x + box.width / 2 + dx, box.y + box.height / 2 + dy], html: e.outerHTML.slice(0, 180) };
    }));
}
export function compareNumberedPrimitives(allRef, allNative, tolerance = 1e-5) {
    const ref = allRef.filter(p => !p.inkEmpty), native = allNative.filter(p => !p.inkEmpty), groups = new Map();
    for (const p of native) {
        if (!groups.has(p.key))
            groups.set(p.key, []);
        groups.get(p.key).push(p);
    }
    const missing = [], different = [];
    let matched = 0, maxDelta = 0;
    for (const a of ref) {
        const g = groups.get(a.key) || [];
        let idx = -1, best = Infinity;
        for (let i = 0; i < g.length; i++) {
            const b = g[i];
            if (!b)
                continue;
            const d = Math.abs(a.center[0] - b.center[0]) + Math.abs(a.center[1] - b.center[1]);
            if (d < best) {
                best = d;
                idx = i;
            }
        }
        if (idx < 0 || best > 1) {
            missing.push(a);
            continue;
        }
        const b = g[idx];
        g[idx] = null;
        matched++;
        const delta = a.coordinates.length === b.coordinates.length ? Math.max(0, ...a.coordinates.map((v, i) => Math.abs(v - b.coordinates[i]))) : Infinity;
        maxDelta = Math.max(maxDelta, delta);
        if (delta > tolerance)
            different.push({ delta, ref: a, native: b });
    }
    return { emptyReference: allRef.length - ref.length, emptyNative: allNative.length - native.length, reference: ref.length, native: native.length, matched, maxDelta, missing, extra: [...groups.values()].flat().filter(Boolean), different };
}
