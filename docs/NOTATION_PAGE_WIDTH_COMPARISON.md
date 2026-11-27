# 简谱与五线谱：页数及自动选宽对比

本页记录8px谱间基线；当前采用6px，最新结果见[6px谱间评估](STAFF_SPACE_6_COMPARISON.md)，7px对照见[7px谱间评估](STAFF_SPACE_7_COMPARISON.md)。

统计日期：2026-11-27；代码版本：`65e4000c`。范围包括曲库、独立作品和示例，共117份谱源；两种谱式逐首源文件SHA-256完全一致，且与当前文件一致。两组生产搜索均重新完成117首测量，串行执行，受2GB总内存限制。

共用528～720px、6px网格及安全剪枝，按页数、间距与字体总代价、版宽排名。简谱音乐em为24px、紧／松档8／16px；五线谱音乐em为32px、谱间8px、紧／松档0.6／1.8谱间、共用符杠系数1。保持各谱源既有调性、速度、等宽小节与行距设置。页数为单曲A4分页结果，未把不同曲目合页。

宽度均为逻辑px；宽度差定义为“五线谱－简谱”。固定纸张下逻辑宽度越大，整谱缩放比例越小；两种谱式的基础音乐尺寸和字形不同，不能直接把宽度差等同于音符字号差。

## 页数

简谱合计124页，五线谱135页，多11页（8.9%）。106份页数一致（90.6%）；11份不同（9.4%），全部是五线谱多1页，没有五线谱更少的曲目。

| 简谱页数 | 五线谱页数 | 谱源数量 |
|---:|---:|---:|
| 1 | 1 | 100 |
| 1 | 2 | 10 |
| 2 | 2 | 6 |
| 2 | 3 | 1 |

全部页数差异曲目：

| 曲目 | 简谱页数 | 五线谱页数 | 简谱宽度 | 五线谱宽度 | 宽度差 |
|---|---:|---:|---:|---:|---:|
| [半音阶口琴基本功](../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n) | 2 | 3 | 720 | 720 | +0 |
| [爱如潮水](../src/scores/ai_ru_chao_shui_01.m3n) | 1 | 2 | 648 | 600 | -48 |
| [黑色幽默](../src/scores/hei_se_you_mo_01.m3n) | 1 | 2 | 708 | 588 | -120 |
| [后来](../src/scores/hou_lai_01.m3n) | 1 | 2 | 678 | 636 | -42 |
| [那些年](../src/scores/na_xie_nian_01.m3n) | 1 | 2 | 648 | 582 | -66 |
| [如愿](../src/scores/ru_yuan_01.m3n) | 1 | 2 | 630 | 558 | -72 |
| [童话镇](../src/scores/tong_hua_zhen_01.m3n) | 1 | 2 | 642 | 558 | -84 |
| [突然好想你](../src/scores/tu_ran_hao_xiang_ni_01.m3n) | 1 | 2 | 660 | 552 | -108 |
| [土耳其进行曲](../src/scores/turkish_march_01.m3n) | 1 | 2 | 678 | 600 | -78 |
| [You Raise Me Up](../src/scores/you_raise_me_up_01.m3n) | 1 | 2 | 582 | 564 | -18 |
| [蜗牛与黄鹂鸟·采蘑菇的小姑娘·踏浪](../src/works/snail-mushroom-waves.m3n) | 1 | 2 | 606 | 534 | -72 |

## 页数相同的106份谱源：宽度差异

其中100份都是1页，6份都是2页。

| 宽度关系 | 数量 | 占同页数样本 |
|---|---:|---:|
| 五线谱更宽 | 92 | 86.8% |
| 宽度相同 | 11 | 10.4% |
| 五线谱更窄 | 3 | 2.8% |

简谱平均宽度551.60px，五线谱597.45px，平均差+45.85px，中位差+36px。绝对差不超过24px的有41份（38.7%）；不超过48px的有65份（61.3%）。

五线谱更宽的前十份：

| 曲目 | 简谱页数 | 五线谱页数 | 简谱宽度 | 五线谱宽度 | 宽度差 |
|---|---:|---:|---:|---:|---:|
| [查尔达什舞曲](../src/scores/cha_er_da_shi_01.m3n) | 2 | 2 | 564 | 714 | +150 |
| [牵丝戏](../src/scores/qian_si_xi_01.m3n) | 1 | 1 | 582 | 720 | +138 |
| [过火](../src/scores/guo_huo_01.m3n) | 1 | 1 | 546 | 672 | +126 |
| [单簧管波尔卡](../src/scores/dan_huang_guan_bo_er_ka_01.m3n) | 1 | 1 | 552 | 672 | +120 |
| [青鸟](../src/scores/qing_niao_01.m3n) | 1 | 1 | 594 | 702 | +108 |
| [人世间](../src/scores/ren_shi_jian_01.m3n) | 1 | 1 | 594 | 702 | +108 |
| [天黑黑](../src/scores/tian_hei_hei_01.m3n) | 1 | 1 | 582 | 690 | +108 |
| [花之舞](../src/scores/flower_dance_01.m3n) | 2 | 2 | 618 | 720 | +102 |
| [C大调奏鸣曲 K.545 第一乐章](../src/scores/mozart_k545_01.m3n) | 2 | 2 | 588 | 690 | +102 |
| [死了都要爱](../src/scores/si_le_dou_yao_ai_01.m3n) | 1 | 1 | 594 | 696 | +102 |

五线谱更窄的全部曲目：

| 曲目 | 简谱页数 | 五线谱页数 | 简谱宽度 | 五线谱宽度 | 宽度差 |
|---|---:|---:|---:|---:|---:|
| [铁血丹心](../src/scores/tie_xue_dan_xin_01.m3n) | 1 | 1 | 552 | 528 | -24 |
| [九儿](../src/scores/jiu_er_01.m3n) | 1 | 1 | 534 | 528 | -6 |
| [欢乐颂（示例）](../src/examples/huan_le_song.m3n) | 1 | 1 | 534 | 528 | -6 |

这表示在当前尺寸与评分下，五线谱通常需要更大的逻辑版宽，才能在相同页数中得到较好的间距评分。宽度差不是横向放不下的直接证明，也不意味着这些宽度可以统一缩小后保持同样页数与质量；宽度会同时改变断行、行高与A4逻辑页高。

## 完整明细与复测口径

[117份完整CSV](NOTATION_PAGE_WIDTH_COMPARISON.csv)包含谱源路径、标题、摘要、两种谱式的页数、宽度和行数。原始结果位于 `.tmp/notation-comparison-current/numbered.json` 与 `staff.json`，汇总位于同目录 `summary.json`。本次为生产选宽统计，`auditLayout=false`，不将原始报告中的空审计数组作为全库零碰撞证明。

```sh
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --numeric-layout --prune --output=.tmp/notation-comparison-current/numbered.json
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs --staff --prune --output=.tmp/notation-comparison-current/staff.json
```

numbered测量包SHA-256：`f25043f6b819720bf0c53a475ff68163c8fe04ab67f9a91413458f6088535d5f`。

staff测量包SHA-256：`0f82e750ac6dac5959b6f7b2a59866514a667d68a66d235916e6dc1dbdbc8b3e`。
