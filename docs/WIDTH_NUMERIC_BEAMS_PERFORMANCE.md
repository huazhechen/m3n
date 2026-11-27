# 五线谱符杠节点延迟生成

2026-11-27，独立工作树 `perf/single-worker-600`。保持 `a5a4c30b` 的6px谱间和0.6／1.8谱间双档，基线为本分支 `76de0c01` 的全量报告；后续简谱缓存生命周期修改不参与五线谱绘制。

数值候选行直接收集符杠已有路径对象的精确边界，绘制时再生成SVG节点和路径属性。与音符已有的延迟绘制方式一致，减少候选阶段的节点、属性和几何遍历。不改路径命令、坐标、舍入、图元数量或边界，也不更改共享的搜索、分页、评分和曲线算法；仍是单Worker、完整528～720px的33个6px档位与安全剪枝。

## 全量测量

117首，真实归档TTF，每批一个新Chromium，批内共享字体与文字度量，无预热、无profiler、无最终SVG。各批串行运行，Node堆384MiB、浏览器堆256MiB，聚合RSS守卫1700MiB。

| 五线谱 | 基线 | 修改后 | 修改后复测 |
|---|---:|---:|---:|
| 累计选宽 | 40.429秒 | 38.910秒 | 38.578秒 |
| 基本功 | 1870.3ms | 1885.6ms | 1808.9ms |
| 超600ms | 19/117 | 18/117 | 18/117 |
| 聚合RSS峰值 | 1444MiB | 1458MiB | 1446MiB |

累计耗时两批分别降低约3.8%与4.6%。基本功改善有限且存在测量波动，不能认为其瓶颈已解决。没有观察到聚合内存峰值下降。逐曲耗时见[CSV](WIDTH_NUMERIC_BEAMS_PERFORMANCE.csv)。**所有乐曲、所有谱式600ms目标仍未达到。**

两次修改后全量测量各有1733组赢家／共同候选与基线一致，包括宽度、页数、行数、物理间距和全部评分分量，绝对误差阈值1e-8。逐曲谱源与字体摘要相同。五线谱24个测试文件238项通过；新增回归核对普通、多层、短钩及三连音符杠在不同宽度、斜率和坐标变换下的原始图元及SVG精确一致。

原始报告位于工作树 `.tmp/cache-lifetime-baseline/staff.json`、`.tmp/numeric-beams/staff.json` 和 `.tmp/numeric-beams-repeat/staff.json`。复现先构建包，再测量：

```sh
python3 tools/run-low-memory.py npm run build:packages
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --output=.tmp/numeric-beams/staff.json
```

此前另试过在收集谱号边界时跳过确定不含谱号的已准备音符子树：累计40.429→40.257秒、基本功1870.3→1859.3ms，未显示稳定收益，已撤回。该报告保存在 `.tmp/selection-skip/staff.json`，候选结果同样一致。
