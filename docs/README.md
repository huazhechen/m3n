# 文档索引

`docs/` 承载两类文档：

**应用内文档**（由 `src/components/HomeDocumentation.tsx` 以 raw 导入，集成在首页；使用“浏览指南”“查阅手册”切换）：

- [GUIDE.md](GUIDE.md)：M3N 使用指南。
- [MANUAL.md](MANUAL.md)：完整语法与约束手册。

**开发内部文档**（不进入应用页面，供维护者与开发 Agent 查阅）：

- [SPARKS_NMN_REVIEW.md](SPARKS_NMN_REVIEW.md)：Sparks NMN 功能与文档对照、口琴场景优先级和改进建议。
- [ARCHITECTURE.md](ARCHITECTURE.md)：前端架构与工作区边界。
- [REFACTOR_PLAN.md](REFACTOR_PLAN.md)：整体重构范围、验收记录与阶段状态。
- [CODEGRAPH.md](CODEGRAPH.md)：模块依赖与数据流。
- [NATIVE_ENGINES.md](NATIVE_ENGINES.md)：自研简谱与演奏引擎、迁移与验收。
- [NATIVE_ACTIVATION.md](NATIVE_ACTIVATION.md)：自研公共入口切换与验证范围。
- [JPFUN_REMOVAL.md](JPFUN_REMOVAL.md)：旧引擎、适配器、依赖与对照工具的彻底移除。
- [VEROVIO.md](VEROVIO.md)：已移除引擎的历史参考。
- [NUMBERED_NOTATION.md](NUMBERED_NOTATION.md)：当前简谱渲染的模型、页面与分行行为。
- [NUMBERED_NOTATION_REMEDIATION.md](NUMBERED_NOTATION_REMEDIATION.md)：简谱质量审视、第三方引擎比较与整改方案。
- [SCOREBOOK.md](SCOREBOOK.md)：谱集复用网页渲染、最佳宽度选择与A4导出。
- [SCORE_TEMPOS.md](SCORE_TEMPOS.md)：内置曲谱的速度参照、拍值换算及逐曲校准记录。

仓库级开发说明见根目录 [README](../README.md)。
