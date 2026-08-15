# 简谱渲染

> 更新日期：2026-08-15  
> 实现：`packages/score-renderer/src/jianpu-score.ts`

## 选择结论

简谱渲染以 M3N 的 `ScoreDocument` 为唯一输入，输出可交互、可分页的 SVG。

GitHub 审计结论：

- [`ssb22/jianpu-ly`](https://github.com/ssb22/jianpu-ly) 是 Apache-2.0 的成熟出版工具链，依赖 Python 与原生 LilyPond。它适合离线出版，不能直接承担浏览器内的实时编辑、源码定位和播放高亮。
- `flufy3d/JianpuRender`、`react-jianpu` 及旧的 `jianpurender` 只覆盖基本音符与时值，缺少本项目需要的歌词、多页、反复、装饰与源码级交互。
- [快乐谱参考页](https://www.kuaiyuepu.com/jianpu/4jxWg1xGS.html) 的可取之处是紧凑的节拍列、印刷风格数字和稳定的歌词层级；它只作为视觉参考，不引入其页面代码或数据。

因此浏览器端不接入第三方简谱绘制库，也不建立另一套语法树；`JianpuScore` 直接排版现有 AST 归一化后的 `ScoreDocument`。这保留了与 MEI、播放时间轴和编辑器的稳定 ID 契约。

## 排版模型

排版按以下顺序进行：

1. 以 `ScoreEvent.beats` 和拍单位构建节拍网格，计算每个小节的自然宽度。
2. 在换行前为数字、临时记号、高低八度点、和弦、连音组、歌词、装饰音和行内调号预留最小可见宽度。
3. 只在小节边界断系统；系统内按可用宽度两端对齐，并在小节内保持节拍位置一致。
4. 根据歌词声部数、三连音和上方标记扩展系统高度；分页时不会拆开系统。
5. 最后绘制小节线、反复、跳房子、连音、力度、速度/调号变更和区间标记。

这一顺序保证 SVG 绘制不承担碰撞修复。新元素必须先声明其布局占位，再进入系统断行。

## 语义与交互

- 每个事件保留 `m3n-e-N`、`data-source-start` 与 `data-source-end`，与 MEI 的遍历顺序一致。
- 旋律和低音均直接来自 `ScoreDocument.parts`；歌词绑定已有的源码范围与连音规则。
- 标题和责任者信息由共享的 `score-header-svg` 写入；歌词、速度、力度、段落和区间文本使用与五线谱一致的系统文本字体、常规字重和墨色。只有数字、临时记号和八度点使用简谱专用的衬线字形。
- 播放复用 Verovio MIDI 时间轴，`elementsAtTime` 通过事件 ID 定位 SVG 元素。
- `JianpuScore.create`、`attach`、`pagesClone` 保持不变，阅读页、编辑器和导出对话框无需专用适配。

## 已知边界

- 浏览器端不会运行 LilyPond；需要其离线制版能力时，应另建受控的导出服务，而不是把原生二进制带入客户端。
- 小节不会被强制拆开。若单个小节中的单个歌词本身超过可用谱面宽度，布局会保留其占位而非压缩到与相邻元素重叠。
