# 乐谱生成结果与提交检查

每首 `src/scores/`、`src/works/`、`src/examples/` 下的 `.m3n` 都维护思源黑体子集。浏览器简谱与五线谱阅读器均在540～640px范围按10px档搜索分页宽度，并在不超过640px基准页数的候选中兼顾字号大小、行密度与末行留白；不将选宽结果写回谱源。字体只使用 Barlow Semi Condensed、Bravura、思源黑体。

五线谱已迁移至 VexFlow。五线谱和简谱都由浏览器按当前排版实时搜索宽度，不在源文件中保存宽度字段；`npm run prepare:scores` 只更新谱源摘要及字体子集。

安装依赖时，`npm run prepare` 自动将 Git 的 `core.hooksPath` 设置为 `.githooks`。提交前钩子运行 `node tools/score-artifacts.mjs --staged`：检测谱源或排版依赖变化，重新生成过期结果，并将结果加入本次提交。存在未完整暂存的相关改动时停止提交，避免把工作区中其他改动带进提交。

首次生成需要 Chromium，以及 Python 的 `fonttools==4.68.0`：

```sh
python3 -m venv .tmp/font-subset-env
.tmp/font-subset-env/bin/pip install fonttools==4.68.0 brotli==1.2.1
npx playwright install chromium
npm run prepare:scores
```

可通过 `M3N_FONT_PYTHON` 指定 Python，通过 `CHROMIUM_PATH` 指定 Chromium。有系统 Chromium 时优先使用系统版本。全量更新需要搜索所有乐谱的简谱宽度，耗时明显高于单首更新。

`config/score-artifacts.json` 记录源文件、排版依赖和所选字体的 SHA-256，以及简谱宽度和页数。修改谱源只更新对应乐谱；修改影响排版的代码、字体或引擎则更新全部乐谱。新增、删除乐谱也会触发生成。CI 执行 `npm run check:score-artifacts`，只校验、不修改文件；绕过本地钩子造成的过期结果会令 CI 失败。

网页乐谱库提供整本简谱谱集导出，使用与页面相同的540～640px实时选宽和排版规则及三字体策略；打开弹窗一次完成PDF生成，准备好后点击直接下载。单首网页使用按内容选择的中文子集；编辑器输入超出内置子集时按需使用完整思源黑体。PNG 使用相同字形轮廓，PDF 嵌入实际使用的字体子集。本地 `npm run build:scorebook` 和 `npm run export:score-pdfs` 仍可使用，发布脚本按当前内容动态生成 `.tmp/scorebook-font/text.ttf` 总子集，不将总子集放入前端。
