# 谱集构建

屏幕、打印预览、单曲导出及整册谱集共用 `src/lib/render-score.ts` 的渲染入口。谱集仅负责选宽、短曲合页、封面目录及 A4 装订，不修改谱源或乐谱内部坐标。

## 版面与选宽

单曲选宽、评分及合页搜索范围见[宽度搜索](WIDTH_SEARCH.md)。合页准入宽度为624px，共同宽度在528～624px间粗搜及细搜；所有成员使用同一缩放比例。音乐、歌词、署名、低音及显式换行完整保留，谱内页边距为0。

连续布局使用谱源指定的最小核心净空，默认28.8px；分页及合页在基础值至其1.1倍之间拟合净空。曲间基础留白来自 `scoreLayoutConfig`。实际笔画的避让要求始终生效。每页按273/186内容比例等比放入210×297mm纸张，四边至少12mm，内容顶部对齐、水平居中。

## 曲目组合

`config/scorebook/library-categories.json` 与 `editorial-plan.json` 定义章节、顺序、合页和重排约束，网站分类与谱集共用分类来源。固定顺序章节按原序动态规划，允许重排的章节使用精确集合分组；优化页数、疏密代价和综合质量分。短曲只在同章内整曲合页；`sharePage: false` 禁止合页，`breakBefore: true` 强制新页。

报告的 `width` 是单曲选择，`bookWidth` 是实际谱集宽度，`sharedWidthSearch` 保存合页准入与搜索范围。封面和目录没有正文页脚；正文页脚链接到曲目。封面版本号与下载文件名使用构建时 Git 短提交号。

## 构建与字体

网页导出复用曲库共享谱源与三字体包，见[共享资源](LIBRARY_RESOURCES.md)。整册导出沿用选择的简谱／五线谱及小节号设置。

本地运行 `npm run build:scorebook`，单曲批量导出使用 `npm run export:score-pdfs`。本地工具从实际谱源和装订文字生成 `.tmp/scorebook-font/text.ttf`，使用锁定的 fonttools；可通过 `M3N_FONT_PYTHON` 指定解释器。Barlow、Bravura及思源黑体与网页同源。

`config/scorebook/` 保存提交的配置；`scorebook/` 与 `.tmp/` 只保存可重建的 PDF、布局报告和字体，不提交 Git。生成结果维护见[生成物](SCORE_ARTIFACTS.md)。
