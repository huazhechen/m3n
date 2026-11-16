import type { GlyphMetrics, TextMeasurer, TextStyle } from "./types.js";

/** 未指定字体族时，普通文本使用的字体栈 */
export const DEFAULT_TEXT_FONT = "sans-serif";

/** 简谱数字及同类谱面数字使用的字体栈 */
export const JIANPU_NUMBER_FONT = "'Cascadia Mono', Consolas, 'Liberation Mono', 'Noto Sans Mono', monospace";

/** Canvas 的 font 简写；测量与绘制必须用同一份，否则量到的不是将要画出的字形 */
export function canvasFont(style: TextStyle): string {
    return `${style.fontWeight ?? "normal"} ${style.fontSize}px ${style.fontFamily ?? DEFAULT_TEXT_FONT}`;
}

/** 默认文本测量保持确定性，不依赖浏览器和操作系统字体。 */
export class DefaultTextMeasurer implements TextMeasurer {
    measureText(text: string, style: TextStyle): GlyphMetrics {
        const size = style.fontSize;
        const monospaced = style.fontFamily?.toLowerCase().includes("mono") ?? false;
        let units = 0;

        for (const char of text) {
            units += char.charCodeAt(0) > 0x7f ? 1 : monospaced ? 0.62 : 0.58;
        }

        return {
            w: Math.max(units * size, size * 0.25),
            h: size,
            baseline: size * 0.8,
            inkBottom: size * 0.8,
        };
    }
}

export const defaultTextMeasurer = new DefaultTextMeasurer();

/**
 * 用宿主的 Canvas 字体度量文本，使排版盒与实际绘制的字形一致。
 * 高度与基线取实际墨迹；字号只规定设计尺度，不代表字形占位。
 */
export class CanvasTextMeasurer implements TextMeasurer {
    private readonly metrics = new Map<string, GlyphMetrics>();

    constructor(private readonly context: CanvasRenderingContext2D) { }

    /**
     * 字体名称不变但实际资源变化时调用，例如 Web 字体加载完成后，旧缓存仍是回退字体的度量。
     * 清理后宿主需重新编译、布局和绘制；仅切换字体族、字号或字重无需清理，它们已包含在缓存键中。
     */
    clearCache(): void {
        this.metrics.clear();
    }

    measureText(text: string, style: TextStyle): GlyphMetrics {
        const font = canvasFont(style);
        const key = `${font}\u0000${text}`;
        let metrics = this.metrics.get(key);
        if (metrics === undefined) {
            this.context.font = font;
            this.context.textAlign = "left";
            this.context.textBaseline = "alphabetic";
            const measured = this.context.measureText(text);
            const ascent = measured.actualBoundingBoxAscent;
            const descent = measured.actualBoundingBoxDescent;
            // Older hosts may expose advance only. Keep the offline estimate
            // in that case; a valid zero-height space must remain zero-height.
            const hasInkMetrics = Number.isFinite(ascent) && Number.isFinite(descent)
                && ascent + descent >= 0;
            metrics = {
                w: Math.max(measured.width, style.fontSize * 0.25),
                h: hasInkMetrics ? ascent + descent : style.fontSize,
                baseline: hasInkMetrics ? ascent : style.fontSize * 0.8,
                inkBottom: hasInkMetrics ? ascent + descent : style.fontSize * 0.8,
                centerOffset: Number.isFinite(measured.actualBoundingBoxLeft) && Number.isFinite(measured.actualBoundingBoxRight)
                    ? (measured.actualBoundingBoxRight - measured.actualBoundingBoxLeft - measured.width) / 2 : 0,
            };
            this.metrics.set(key, metrics);
        }
        // Callers can annotate their result without corrupting the cache.
        return { ...metrics };
    }
}
