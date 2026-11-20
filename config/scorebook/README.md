# 曲库与谱集配置

本目录只保存构建所需的配置：

- `editorial-plan.json`：谱集章节、曲目顺序、合页／换页约束、纸张尺寸及输出版本，供在线导出和离线生成共用。
- `library-categories.json`：网站乐谱库的分类、分类顺序和分类内曲目顺序，也是阅读页上一曲／下一曲的顺序依据。

谱源位于 `src/scores/`。修改配置后提交Git；曲谱来源、校订说明和旧排查记录已按要求清理，可通过Git历史查阅。

仅通过链接发布的独立作品位于 `src/works/`，不加入上述两份配置，也不参与整册导出；详见[独立作品归档](../../docs/WORKS.md)。

`scorebook/` 仅作为本地输出目录，整目录被 `.gitignore` 排除，可以随时全部删除。PDF、布局JSON、校验稿、图片与CSV报告均不提交Git。

重新生成整册、单曲PDF及校验稿：

```sh
node tools/refresh-score-pdfs.mjs
```

生成成功后如有谱头建议版宽回写，提交相应谱源即可。详细构建规则见[谱集说明](../../docs/SCOREBOOK.md)。
