# M3N 前端架构

## 目标

本项目的核心资产不是页面，而是 M3N 语法、转换正确性和乐谱交互。架构以纯领域逻辑为中心，React 页面只负责组合功能和管理界面状态。

依赖方向必须保持单向：

```text
pages -> components -> features -> lib/notation
                            \-> third-party adapters (Verovio, SpessaSynth, jsPDF)
```

`lib/notation` 不得依赖 React、DOM 或具体页面。转换函数应保持确定性：相同输入总是产生相同输出与诊断。

## 当前边界

- `lib/notation/types.ts`：格式、转换结果和源码映射契约。
- `lib/notation/m3n-primitives.ts`：调号、音符和时值等最小语法内核。
- `lib/notation/repeats.ts`：反复次数、跳房子及 D.S./D.C. 的纯播放计划；Direct、MEI 和歌词对位共享其语义。
- `lib/notation/supplements.ts`：歌词与低音补充块解析。
- `lib/m3n-direct.ts`：直接解析 M3N 文档并生成供 MEI 序列化使用的事件模型。
- `lib/m3n-validate.ts`：语义校验，只依赖最小语法内核。
- `features/score-renderer`：播放段落展开、导出文档与画布适配。
- `lib/m3n-mei.ts`：M3N 到 MEI 中间文档、稳定 `xml:id` 与源码映射。
- `features/score-renderer/verovio-score.ts`：Verovio SVG 排版、MIDI 生成和时间映射。
- `features/score-renderer/spessa-player.ts`：SpessaSynth 播放与 zPiano-SF3 音色加载。
- `components/ScoreRenderer.tsx`：组合 MEI 渲染、播放和光标事件。
- `components/ScoreExportDialog.tsx`：导出状态、预览及 PNG/PDF 工作流。
- `components/SourceEditor.tsx`：源码输入与尺寸同步。
- `pages`：路由级组合，不承载领域算法。

## 质量门禁

提交前执行 `npm run check`，依次完成 lint、单元/语料测试、严格类型检查和生产构建。测试分三层：

1. 基础语法单元测试，覆盖音符、时值、调号和补充块。
2. 转换契约测试，覆盖往返、诊断和源码映射。
3. 全量内置乐谱语料测试，防止真实乐谱在重构后无法转换。

已修复的回归必须先有失败测试。第三方库细节应封装在 feature 或 component 边界，不得渗入 notation 内核。

## 后续演进

按以下顺序继续，且每一步保持公共转换 API 兼容：

1. 以 `notation/repeats` 的播放计划为单一事实来源，逐步让歌词对位直接消费书写小节到演奏轮次的映射。
2. 继续扩充 M3N 直接解析器对出版语义和演奏语义的覆盖。
3. 为转换器引入显式 token/AST，替代多轮正则修改字符串；源码映射由 token span 自然生成。
4. 将诊断从字符串升级为 `{ code, severity, message, range }`，界面再负责本地化展示。
5. 为 `noUncheckedIndexedAccess` 逐模块消除风险，优先处理解析器和校验器，不使用无依据的非空断言。
6. 将乐谱元数据生成到独立索引，乐谱正文按 slug 异步加载，避免列表页加载全部正文。
7. 增加浏览器级编辑、播放、导出和键盘可访问性测试。

不建议为缩短文件而制造一行转发层；拆分应围绕稳定职责、可独立测试的状态机或第三方适配边界进行。
