# 简谱最优宽度：当前方案与 master 对照

基线为 master `fcc3f355`，当前引擎为 `7eb49601`。两套引擎都使用基线 worktree 中同一批谱源，逐首 SHA-256 一致；《暗香》使用该 master 的更新版本，未将谱源变化计入宽度差异。范围包括曲库、独立作品和示例，共117份。

master 使用其原有24px粗搜和赢家附近6px细搜；当前方案为8／16px最小间距两档，全曲动态规划仍包含总拉伸，最终排名只计不均匀与字体缩小，跨宽度页数优先，并搜索528～768px的全部6px离散档位。这是两套实际选宽策略的结果对比，没有调整参数以贴近基线。

最优宽度不变71份，变窄37份，变宽9份。111/117份的差异不超过24px，117/117份不超过48px，最大绝对差异36px。

按历史回归指标，页数不变和最大48px两项满足；24px以内占比为94.87%，略低于95%，共有6首超出。此次只记录差异，没有据此改参数。

页数不变117份，减少0份，增加0份。当前所有赢家均执行真实字体分页SVG审计，单页曲目另查连续SVG；越界0处、碰撞0处。master 基线仅搜索选宽，未重新独立审计其笔画。

## 所有宽度变化（单位：px）

| 曲目 | master 宽度 | 当前宽度 | 差值 | 页数（旧→新） | 行数（旧→新） |
|---|---:|---:|---:|---:|---:|
| [贝加尔湖畔](../src/scores/bei_jia_er_hu_pan_01.m3n) | 618 | 582 | -36 | 1→1 | 9→9 |
| [天黑黑](../src/scores/tian_hei_hei_01.m3n) | 624 | 588 | -36 | 1→1 | 11→11 |
| [梨花又开放](../src/scores/li_hua_you_kai_fang_01.m3n) | 528 | 558 | +30 | 1→1 | 7→7 |
| [如愿](../src/scores/ru_yuan_01.m3n) | 672 | 642 | -30 | 1→1 | 11→11 |
| [同桌的你](../src/scores/tong_zhuo_de_ni_01.m3n) | 528 | 558 | +30 | 1→1 | 7→8 |
| [快速圆舞曲](../src/scores/valsentino_01.m3n) | 582 | 552 | -30 | 2→2 | 28→28 |
| [卡农](../src/scores/canon_01.m3n) | 684 | 660 | -24 | 1→1 | 17→16 |
| [凉凉](../src/scores/liang_liang_01.m3n) | 624 | 600 | -24 | 1→1 | 9→8 |
| [美丽的神话](../src/scores/mei_li_de_shen_hua_01.m3n) | 582 | 558 | -24 | 1→1 | 9→10 |
| [第二圆舞曲](../src/scores/second_waltz_01.m3n) | 552 | 528 | -24 | 1→1 | 14→13 |
| [国际歌](../src/scores/the_internationale_01.m3n) | 576 | 552 | -24 | 1→1 | 8→7 |
| [听海](../src/scores/ting_hai_01.m3n) | 630 | 606 | -24 | 1→1 | 10→10 |
| [烟花易冷](../src/scores/yan_hua_yi_leng_01.m3n) | 612 | 588 | -24 | 1→1 | 9→9 |
| [一千个伤心的理由](../src/scores/yi_qian_ge_shang_xin_de_li_you_01.m3n) | 654 | 630 | -24 | 1→1 | 10→10 |
| [深情的吻](../src/scores/besame_mucho_01.m3n) | 588 | 570 | -18 | 1→1 | 14→13 |
| [查尔达什舞曲](../src/scores/cha_er_da_shi_01.m3n) | 588 | 570 | -18 | 2→2 | 27→26 |
| [单簧管波尔卡](../src/scores/dan_huang_guan_bo_er_ka_01.m3n) | 588 | 570 | -18 | 1→1 | 10→9 |
| [过火](../src/scores/guo_huo_01.m3n) | 576 | 558 | -18 | 1→1 | 10→10 |
| [后会无期](../src/scores/hou_hui_wu_qi_01.m3n) | 672 | 654 | -18 | 1→1 | 12→11 |
| [梦幻曲](../src/scores/meng_huan_qu_01.m3n) | 546 | 528 | -18 | 1→1 | 6→6 |
| [那些年](../src/scores/na_xie_nian_01.m3n) | 678 | 696 | +18 | 1→1 | 13→11 |
| [你是我心爱的姑娘](../src/scores/ni_shi_wo_xin_ai_de_gu_niang_01.m3n) | 696 | 678 | -18 | 1→1 | 9→8 |
| [散步](../src/scores/san_bu_01.m3n) | 528 | 546 | +18 | 1→1 | 12→10 |
| [三套车](../src/scores/san_tao_che_01.m3n) | 546 | 528 | -18 | 1→1 | 4→4 |
| [死了都要爱](../src/scores/si_le_dou_yao_ai_01.m3n) | 624 | 606 | -18 | 1→1 | 12→11 |
| [童话镇](../src/scores/tong_hua_zhen_01.m3n) | 672 | 654 | -18 | 1→1 | 10→10 |
| [土耳其进行曲](../src/scores/turkish_march_01.m3n) | 702 | 684 | -18 | 1→1 | 14→14 |
| [喜欢你](../src/scores/xi_huan_ni_01.m3n) | 528 | 546 | +18 | 1→1 | 10→10 |
| [月半小夜曲](../src/scores/yue_ban_xiao_ye_qu_01.m3n) | 630 | 612 | -18 | 1→1 | 11→11 |
| [最长的电影](../src/scores/zui_chang_de_dian_ying_01.m3n) | 552 | 534 | -18 | 1→1 | 9→9 |
| [枫](../src/scores/feng_01.m3n) | 588 | 576 | -12 | 2→2 | 22→21 |
| [后来](../src/scores/hou_lai_01.m3n) | 720 | 708 | -12 | 1→1 | 13→13 |
| [青鸟](../src/scores/qing_niao_01.m3n) | 612 | 600 | -12 | 1→1 | 14→14 |
| [如果有你在](../src/scores/ru_guo_you_ni_zai_01.m3n) | 528 | 540 | +12 | 1→1 | 11→13 |
| [她说](../src/scores/ta_shuo_01.m3n) | 672 | 660 | -12 | 1→1 | 12→12 |
| [我要你](../src/scores/wo_yao_ni_01.m3n) | 540 | 528 | -12 | 1→1 | 6→8 |
| [星星点灯](../src/scores/xing_xing_dian_deng_01.m3n) | 564 | 552 | -12 | 2→2 | 21→20 |
| [洋葱](../src/scores/yang_cong_01.m3n) | 654 | 642 | -12 | 1→1 | 10→10 |
| [安妮](../src/scores/annie_01.m3n) | 570 | 564 | -6 | 1→1 | 11→11 |
| [花之舞](../src/scores/flower_dance_01.m3n) | 636 | 630 | -6 | 2→2 | 30→30 |
| [黑色幽默](../src/scores/hei_se_you_mo_01.m3n) | 720 | 726 | +6 | 1→1 | 13→12 |
| [老男孩](../src/scores/lao_nan_hai_01.m3n) | 654 | 660 | +6 | 1→1 | 10→10 |
| [突然好想你](../src/scores/tu_ran_hao_xiang_ni_01.m3n) | 678 | 672 | -6 | 1→1 | 12→12 |
| [温柔的倾诉](../src/scores/wen_rou_de_qing_su_01.m3n) | 528 | 534 | +6 | 1→1 | 7→7 |
| [遇见](../src/scores/yu_jian_01.m3n) | 534 | 528 | -6 | 1→1 | 9→9 |
| [致爱丽丝](../src/scores/zhi_ai_li_si_01.m3n) | 606 | 600 | -6 | 1→1 | 13→13 |

## 页数变化

全部页数保持不变。

完整117份的宽度、页数、行数与谱源摘要见 [CSV](NUMBERED_WIDTH_COMPARISON.csv)。完整运行报告保留于 `.tmp/all-numbered-master/baseline.json` 和 `current.json`，日志为 `.tmp/all-numbered-master-baseline.log` 与 `.tmp/all-numbered-master-current.log`。独立 worktree 位于 `/root/project/m3n-spacing-master-audit`，基线与当前批次串行执行，均使用总内存守卫及单浏览器。

复现当前对照：

```sh
python3 tools/run-low-memory.py node tools/benchmark-numbered-spacing.mjs \
  --source-root=/root/project/m3n-spacing-master-audit/src \
  --baseline=.tmp/all-numbered-master/baseline.json \
  --output=.tmp/all-numbered-master/current.json --audit
```
