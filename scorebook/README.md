# 循序渐进乐谱集

本目录在Git中只维护构建配置、使用说明和人工校订／设计记录。PDF、布局报告、体积报告、排序导出和全量核查CSV均为本地生成物，不纳入版本控制。

谱源位于`src/scores/`，三篇编排、曲目顺序和排版选项由[editorial-plan.json](editorial-plan.json)配置。构建与校验脚本位于`tools/`。

首次构建或重新试排：

```sh
npm ci
npm run build:scorebook
```

构建在本目录生成配置指定的PDF，以及`layout-record.json`、`PDF体积记录.json`、`排序与缩放记录.csv`和`排序与缩放记录.md`。中间布局和页面文件位于`.tmp/`，同样不提交。生成文件可以在本机查看、分享，但不再通过Git分发。

已有本地布局报告时，可保留未改谱的字号：

```sh
npm run build:packages
node tools/build-scorebook.mjs --retain-unchanged-sizes
```

`--retain-unchanged-sizes`依赖上一次本地生成的`layout-record.json`；全新检出先使用普通构建。`npm run compact:scorebook`同样在已有布局和页面文件后使用。

人工维护的[校订记录](校订记录.md)、[逐页校阅](逐页校阅.md)、[顺读段落核查](顺读段落核查.md)和各曲参考分析继续保存，数值代表对应版本的人工校阅快照；最新自动统计以本地构建结果为准。简谱语法及布局行为见[手册](../docs/MANUAL.md)和[渲染说明](../docs/NUMBERED_NOTATION.md)。

谱集编写约定：按印刷顺序顺读的曲目，用普通乐句、反复和跳房子组织，不添加只用于演奏定位的具名段落，也不声明与印刷顺序完全一致的 `order`。确实依靠段名回跳、复用时，再添加方框段名与演奏顺序；基本功的教学分类标题可保留。
