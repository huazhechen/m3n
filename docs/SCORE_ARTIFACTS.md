# 乐谱生成结果与提交检查

每首 `src/scores/`、`src/works/`、`src/examples/` 下的 `.m3n` 都维护简谱 `preferred-width` 和思源黑体子集。生成器实际在 Chromium 中排版，搜索安全宽度，再更新谱源与字体。字体只使用 Barlow Semi Condensed、Bravura、思源黑体。

五线谱已迁移至 VexFlow。曲库和独立作品的 `staff-preferred-width` 通过 `npm run refresh:staff-widths -- --fresh` 独立刷新；它搜索稳定、安全且页数较少的版宽，并核验 ±5px 邻域，全部成功后统一回写。引擎迁移或排版规则调整后，应先刷新建议版宽，再检查默认谱面的疏密与碰撞；规则再次改变时重新核验。搜索范围与取舍见[五线谱显示](STAFF_NOTATION.md#验证与选宽)。提交钩子暂不自动搜索五线谱宽度；刷新后仍须运行 `npm run prepare:scores` 同步谱源摘要及字体生成记录。

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

网页已移除整本谱集的导出入口。单首网页使用按内容选择的中文子集；编辑器输入超出内置子集时按需使用完整思源黑体。PNG 使用相同字形轮廓，PDF 嵌入实际使用的字体子集。本地 `npm run build:scorebook` 和 `npm run export:score-pdfs` 仍可使用，发布脚本按当前内容动态生成 `.tmp/scorebook-font/text.ttf` 总子集，不将总子集放入前端。
