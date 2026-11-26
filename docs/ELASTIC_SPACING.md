# 自然间距与弹性分行

典型谱例的改前改后视觉评估见[弹性间距审视](ELASTIC_SPACING_REVIEW.md)，其中记录了篇幅代价和简单旋律的压缩反例。

简谱与五线谱共用 `elastic-spacing.ts` 的弹簧求解器。每个间隔有碰撞下限、自然长度、拉伸弹性和压缩弹性；给定行宽后，以同一个力平衡整条链。压缩到下限的间隔停止收缩，剩余压力分给其他间隔。不能满足的宽度保留硬下限，由分行或超宽小节分片处理，不缩小字形。

`native-spacing.ts` 把同步声部、稀疏歌词和符号占位转换为保守的碰撞下限。刚性组先折叠求解，再恢复内部固定偏移。歌词的额外阅读净空属于自然需求，不增加碰撞下限；多个声部或歌词层共享同一个间隔，采用最大约束而不叠加。求解过程不修改调用方输入。

自然间距用于比较整段的分行方案：既比较把下一小节移到后行所需的拉伸，也比较把它留在本行所需的压缩；相邻行的疏密变化一起计分。强制换行和不可拆连音组仍是硬约束。选宽继续使用原有候选、评分和页数优先规则。

五线谱采用 LilyPond 的时值模型。基础时值为每小节最短时值中出现最多的一种，上限为八分音符；同频时取较短者。基础间隔为实际 Bravura 普通符头宽加1.2个谱间；时值每翻倍增加1.2个谱间，短于基础时值时只按比例缩小符头后的留白。整首和分片共用同一个基础时值；连梁组内不再把自然间距乘0.5。实际符号、歌词及多声部占位仍可能增大距离。这是参考其间距原则的原生实现，不是 LilyPond 排版结果的逐像素复刻。

简谱保留自身的时值平方根权重、连组与延长音槽比例，以音乐字号推导自然净空，不套用五线谱的谱间常数。硬占宽及选宽评分的校准保持独立，避免仅为加入弹性机制而扩大整本简谱。

参考：[LilyPond 2.24 横向间距](https://lilypond.org/doc/v2.24/Documentation/notation/horizontal-spacing-overview)、[符号间隔计算](https://github.com/lilypond/lilypond/blob/stable/2.24/lily/note-spacing.cc)、[弹簧实现](https://github.com/lilypond/lilypond/blob/stable/2.24/lily/spring.cc)。

## 简谱回归约束

用 `tools/benchmark-numbered-spacing.mjs` 在真实字体的浏览器中逐曲执行完整粗搜／细搜。构建打包先退出，再逐曲创建和关闭浏览器，不启动开发服务器。基线和改后报告必须使用相同源码 SHA-256。

验收目标：全部曲目的最优页数不变，至少95%的最优宽度变化不超过24px，最大变化不超过48px。记录全部例外，不以更换选宽评分、覆盖最优宽度或修改谱源满足约束。独立 SVG 笔画验收另行进行。

```sh
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --output=.tmp/elastic-before/report.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --baseline=.tmp/elastic-before/report.json --output=.tmp/elastic-after/report.json --check
```

## 本次回归结果

基线为 `master` 的 `2d7cd309`，包含117首曲库、作品和示例。全部最优页数不变；110首最优宽度完全相同，7首变化6～12px，全部在一个24px档位内。全部117首最优宽度的分页 SVG，以及单页曲目的连续 SVG 检查均为零越界、零碰撞。未修改谱源、宽度搜索候选及跨版宽质量评分。

| 谱源 | 基线宽度 | 重构后宽度 | 页数变化 |
|---|---:|---:|---:|
| `scores/feng_01.m3n` | 588px | 582px | 0 |
| `scores/lao_nan_hai_01.m3n` | 654px | 660px | 0 |
| `scores/ming_tian_hui_geng_hao_01.m3n` | 606px | 612px | 0 |
| `scores/qiu_ying_01.m3n` | 642px | 636px | 0 |
| `scores/tu_ran_hao_xiang_ni_01.m3n` | 678px | 672px | 0 |
| `scores/valsentino_01.m3n` | 582px | 576px | 0 |
| `scores/wo_yao_ni_01.m3n` | 540px | 528px | 0 |


## 五线谱固定宽度的变化

五线谱继续对超过自然占宽的压缩施加较强代价，因此密集谱例会增加行数。这是采用自然间距后的预期行为，不要求与简谱行数或页数一致。640px真实字体密度回归中，《花之舞》为33行／3页，K545为25行／3页，口琴基本功为47行／4页；简谱分别为30行／2页、23行／2页、40行／3页。《玛丽有只小羔羊》的五线谱可以自然容纳于1行，简谱仍为2行。

`tools/compare-notation-density.mjs` 的五线谱行数、高度与双谱式高度比门槛据此重新校准；K545简谱固定640px的连续高度为1553px，原1545px上限调整为1570px，其最优600px版宽和2页结果不变。音乐字号、谱间、歌词字号、事件完整性及零越界／零碰撞要求保持原值。
