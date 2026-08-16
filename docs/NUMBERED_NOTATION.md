# Open Fanqie 简谱渲染

简谱视图以 `/tmp/open-fanqie` 的固定基准提交 `5a97529` 为唯一视觉来源。其页面配置、字形、字体、横向布局、歌词避让、声部布局、反复线和 SVG 结构被内置在 `@m3n/score-renderer` 的 `open-fanqie-core` 中，并保留 MIT 许可文本。

`renderOpenFanqieScore(document, options)` 的唯一音乐输入是 `ScoreDocument`。它不读取 M3N 源文本、语法树、MEI 或 Verovio SVG。应用使用同一份 `ScoreDocument` 驱动简谱视图，仍以 MEI/Verovio 提供 MIDI、播放时序与五线谱视图。

## 支持范围

适配器从 `ScoreDocument` 投影标题、右上角署名（演唱者优先、否则作曲者）、调号、拍号、速度、旋律/低音、休止、小节线、反复、跳房子、歌词、延音、连音组、力度、渐强/渐弱、文字和显式换行。`tuplet` 事件会展开为独立的顺序音符，使用 Open Fanqie 原生的连音组标记和紧凑时值布局，不会被投影为竖排和音；其 SVG 子音符仍以父事件 ID 供编辑器定位。速度使用 Open Fanqie 的节拍字形并按页头比例缩放。事件保留稳定的 `m3n-e-N` ID，因此点击选音、播放高亮和源码定位仍与现有交互契约一致。

Open Fanqie 原始数据模型没有和音组。M3N 的 `chord` 事件因此投影为一个节奏锚点及其上方竖排音高；竖排间距和低八度点号避让由适配器补充，其余音符字形和横向布局仍使用 Open Fanqie 核心。分页不采用固定系统数，而是按 Open Fanqie 实际的歌词、声部和系统高度装页。

`{lg}` 连奏区间投影为 Open Fanqie 连线。相邻且中间没有音符的区间合并为一条；跨系统的单一连奏使用 Open Fanqie 原生的 continuation 线段。原生的延音连线与显式连音组标记仍按各自的 `ScoreDocument` 语义渲染。

当前 M3N `ScoreDocument` 未结构化表达的 Open Fanqie 专有功能不会由渲染器猜测或旁路读取：任意自定义 SVG、Open Fanqie DSL 的 inline layer、倚音结构和没有对应字段的装饰记号均不支持。它们必须先成为 `ScoreDocument` 的正式语义，才可加入渲染。

## 页面行为

分页视图以 Open Fanqie A4 的 `1000 × 1415` 为基准。为使简谱与 Verovio 五线谱在相同显示宽度下保持接近的视觉比例，应用以 `0.8` 的视觉缩放换算乐谱宽度后写入 Open Fanqie 页面配置，再由响应式 SVG 适配容器；这会同时缩小字形、字体和间距，并重新计算可打印宽度、自动断行和页高。连续模式会按系统数扩展 SVG viewBox 高度。因用户选择保留这些响应式行为，非基准宽度不是像素级 Open Fanqie A4 基准。

## 验证

包级测试验证 Open Fanqie 页面、字形、字体和稳定事件 ID，并验证渲染不依赖 `ScoreDocument.source` 的内容；还覆盖低音和音避让、按歌词高度分页和自动换行的两端对齐。端到端测试覆盖简谱开关、页面渲染和事件定位。
