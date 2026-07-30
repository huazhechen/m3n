# M3N 前端架构

## 目标

本项目的核心资产不是页面，而是 M3N 语法、转换正确性和乐谱交互。架构以纯领域逻辑为中心，React 页面只负责组合功能和管理界面状态。

依赖方向必须保持单向：

```text
pages -> components -> features -> lib/notation
                            \-> third-party adapters (abcjs, jsPDF)
```

`lib/notation` 不得依赖 React、DOM 或具体页面。转换函数应保持确定性：相同输入总是产生相同输出与诊断。

## 当前边界

- `lib/notation/types.ts`：格式、转换结果和源码映射契约。
- `lib/notation/m3n-primitives.ts`：调号、音符和时值等最小语法内核。
- `lib/notation/supplements.ts`：歌词与低音补充块解析。
- `lib/m3n-abc.ts`：M3N/ABC 双向转换的兼容入口。现阶段保留公共 API，内部继续按方向拆分。
- `lib/m3n-validate.ts`：语义校验，只依赖最小语法内核。
- `features/score-renderer`：播放段落展开、导出文档与画布适配。
- `components/ScoreRenderer.tsx`：abcjs 实时渲染、播放和光标事件。
- `components/ScoreExportDialog.tsx`：导出状态、预览及 PNG/PDF 工作流。
- `components/SourceEditor.tsx`：源码输入、行号与尺寸同步。
- `pages`：路由级组合，不承载领域算法。

## 质量门禁

提交前执行 `npm run check`，依次完成 lint、单元/语料测试、严格类型检查和生产构建。测试分三层：

1. 基础语法单元测试，覆盖音符、时值、调号和补充块。
2. 转换契约测试，覆盖往返、诊断和源码映射。
3. 全量内置乐谱语料测试，防止真实乐谱在重构后无法转换。

已修复的回归必须先有失败测试。第三方库细节应封装在 feature 或 component 边界，不得渗入 notation 内核。

## 后续演进

按以下顺序继续，且每一步保持公共转换 API 兼容：

1. 将 `m3n-abc.ts` 拆为 `m3n-to-abc`、`abc-to-m3n` 和共享乐理模块。
2. 为转换器引入显式 token/AST，替代多轮正则修改字符串；源码映射由 token span 自然生成。
3. 将诊断从字符串升级为 `{ code, severity, message, range }`，界面再负责本地化展示。
4. 为 `noUncheckedIndexedAccess` 逐模块消除风险，优先处理解析器和校验器，不使用无依据的非空断言。
5. 将乐谱元数据生成到独立索引，乐谱正文按 slug 异步加载，避免列表页加载全部正文。
6. 增加浏览器级编辑、播放、导出和键盘可访问性测试。

不建议为缩短文件而制造一行转发层；拆分应围绕稳定职责、可独立测试的状态机或第三方适配边界进行。
