# 均匀度与异常短行修复

基线为 `ee244766`（v37），修复策略为v38。简谱、五线谱共用同一评分实现；未修改谱源或加入曲目特例。

## 原因与规则

v37保留了逐间隔拥挤、过疏代价，却将均匀度从总分中移除。这超出了舒适区调整范围：少量极端拉伸会被全曲大量零代价间隔稀释。

《半音阶口琴基本功》简谱738px的第67小节单独占行，随后68～70小节占一行。单独一行的12个归一化间隔约125.44px，明显超过24px上限，行内过疏均值约17.864；但全曲1114个样本使这一行对总过疏代价的贡献仅约0.1924。过疏不是漏算，字体收益最终压过了平均后的差异。

恢复均匀度并沿用原有行间口径：设各行 `unitRhythmicGap` 的平均值为μ，每行相对偏差为 `dᵣ=(r-μ)²/μ²`，均匀度代价为 `mean(dᵣ)+max(dᵣ)`。最大偏差使异常短行保留足够影响力；不把行内由歌词等占位产生的正常间隔差异当作行间不均匀。总分仍先比较页数，再比较均匀度＋逐间隔拥挤平均＋逐间隔过疏平均＋字体代价＋溢出代价，各项系数均为1。

舒适区、时值归一化、零代价参与平均的规则均保留。舒适区内拥挤与过疏代价为零，均匀度仍独立参与取舍。没有改成对平均间距计算拥挤或过疏。

## 基本功实际几何

| 简谱宽度 | 均匀度 | 拥挤 | 过疏 | 字体 | v38总分 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 738px | 8.4112 | 0.0011 | 0.4023 | 3.0625 | 11.8771 |
| 744px | 0.5530 | 0.0008 | 0.2571 | 3.2400 | 4.0510 |

简谱选宽738→744px，第67～70小节恢复为 `[67,68] / [69,70]`，仍为2页37行。五线谱选宽606→612px，同一组四小节放在同一行。宽度变化对应字号反向变化，简谱此次字号约减少0.81%，换回均衡断行。

几何复核使用共享曲库真实TTF，分别检查两种谱式实际选宽的完整排版结果。诊断文件位于 `.tmp/uniformity-probe/`（v37）与 `.tmp/uniformity-row-geometry/`（v38），实际赢家复核见 `.tmp/uniformity-row-winner-audit/report.json`。

## 全库选宽对照

前后117份谱源一致，沿用生产剪枝及局部6px细搜，每次新建排版任务，不复用持久选宽缓存。该测量不代表全范围6px网格最优性证明。

| 谱式 | 变窄 | 不变 | 变宽 | 页数变化 | 总行数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 简谱 | 4 | 76 | 37 | 0 | 1072→1053 |
| 五线谱 | 1 | 102 | 14 | 0 | 897→897 |

均匀度恢复后，部分选宽变大、字号相应缩小，这是恢复均衡间距的取舍。逐间隔舒适区仍允许不拥挤时选择更大字号；不会把所有较大间隔都当作额外收益。

| 谱源 | 简谱 v37→v38 | 五线谱 v37→v38 |
| --- | ---: | ---: |
| `scores/ai_de_li_zan_01.m3n` | 540→558 | 534→534 |
| `scores/ai_er_lan_hua_mei_01.m3n` | 528→528 | 528→534 |
| `scores/ai_ru_chao_shui_01.m3n` | 666→666 | 726→726 |
| `scores/an_xiang_01.m3n` | 666→696 | 678→678 |
| `scores/annie_01.m3n` | 552→552 | 570→570 |
| `scores/auld_lang_syne_01.m3n` | 528→528 | 594→594 |
| `scores/autumn_leaves_01.m3n` | 528→528 | 546→546 |
| `scores/badinerie_bwv1067_01.m3n` | 528→534 | 528→528 |
| `scores/bai_hua_lin_01.m3n` | 564→564 | 600→600 |
| `scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n` | 738→744 | 606→612 |
| `scores/beer_barrel_polka_01.m3n` | 528→528 | 552→552 |
| `scores/bei_jia_er_hu_pan_01.m3n` | 576→576 | 564→564 |
| `scores/besame_mucho_01.m3n` | 558→558 | 528→528 |
| `scores/butter_fly_01.m3n` | 540→546 | 570→576 |
| `scores/cai_yun_zhui_yue_01.m3n` | 528→528 | 546→576 |
| `scores/canon_01.m3n` | 642→666 | 618→618 |
| `scores/castle_in_the_sky_01.m3n` | 528→528 | 528→528 |
| `scores/cha_er_da_shi_01.m3n` | 564→564 | 624→624 |
| `scores/chong_er_fei_01.m3n` | 528→528 | 528→528 |
| `scores/dan_huang_guan_bo_er_ka_01.m3n` | 552→558 | 582→582 |
| `scores/dang_nian_qing_01.m3n` | 534→534 | 534→534 |
| `scores/duo_lai_mi_01.m3n` | 528→528 | 534→534 |
| `scores/feng_01.m3n` | 762→762 | 600→600 |
| `scores/flower_dance_01.m3n` | 618→618 | 624→630 |
| `scores/fly_me_to_the_moon_01.m3n` | 528→528 | 546→546 |
| `scores/g_xian_shang_de_yong_tan_diao_01.m3n` | 528→534 | 534→534 |
| `scores/guang_yin_de_gu_shi_01.m3n` | 528→528 | 540→540 |
| `scores/guo_huo_01.m3n` | 564→558 | 636→636 |
| `scores/haydn_surprise_minuet_01.m3n` | 528→528 | 528→528 |
| `scores/hei_se_you_mo_01.m3n` | 708→708 | 750→750 |
| `scores/hong_he_gu_01.m3n` | 534→528 | 528→528 |
| `scores/hong_mei_hua_er_kai_01.m3n` | 546→540 | 534→534 |
| `scores/hou_hui_wu_qi_01.m3n` | 648→648 | 684→684 |
| `scores/hou_lai_01.m3n` | 702→702 | 768→768 |
| `scores/huan_le_song_01.m3n` | 528→528 | 528→528 |
| `scores/huang_hun_01.m3n` | 528→528 | 528→528 |
| `scores/jiu_er_01.m3n` | 528→534 | 564→564 |
| `scores/katyusha_01.m3n` | 528→528 | 528→528 |
| `scores/lao_nan_hai_01.m3n` | 648→654 | 672→672 |
| `scores/li_hua_you_kai_fang_01.m3n` | 528→534 | 540→540 |
| `scores/liang_liang_01.m3n` | 582→582 | 612→612 |
| `scores/liang_zhu_01.m3n` | 528→540 | 528→528 |
| `scores/long_long_ago_01.m3n` | 528→528 | 552→528 |
| `scores/ma_li_you_zhi_xiao_gao_yang_01.m3n` | 528→528 | 576→576 |
| `scores/man_bu_ren_sheng_lu_01.m3n` | 528→528 | 534→534 |
| `scores/man_man_xi_huan_ni_01.m3n` | 570→570 | 618→618 |
| `scores/mei_li_de_shen_hua_01.m3n` | 546→552 | 606→606 |
| `scores/meng_huan_qu_01.m3n` | 528→534 | 528→528 |
| `scores/ming_tian_hui_geng_hao_01.m3n` | 606→606 | 618→618 |
| `scores/mo_li_hua_01.m3n` | 528→528 | 540→540 |
| `scores/mo_si_ke_jiao_wai_de_wan_shang_01.m3n` | 528→528 | 534→534 |
| `scores/moon_river_01.m3n` | 528→540 | 540→540 |
| `scores/mozart_k545_01.m3n` | 588→588 | 624→636 |
| `scores/na_xie_nian_01.m3n` | 648→648 | 690→690 |
| `scores/ni_shi_wo_xin_ai_de_gu_niang_01.m3n` | 654→654 | 642→642 |
| `scores/over_the_rainbow_01.m3n` | 528→534 | 570→570 |
| `scores/por_una_cabeza_01.m3n` | 528→534 | 528→534 |
| `scores/qian_nv_you_hun_01.m3n` | 528→528 | 528→528 |
| `scores/qian_si_xi_01.m3n` | 600→600 | 672→672 |
| `scores/qing_niao_01.m3n` | 600→600 | 648→648 |
| `scores/qiu_ying_01.m3n` | 618→618 | 642→654 |
| `scores/rang_wo_men_dang_qi_shuang_jiang_01.m3n` | 528→528 | 558→558 |
| `scores/ren_shi_jian_01.m3n` | 606→606 | 648→648 |
| `scores/ru_guo_you_ni_zai_01.m3n` | 528→540 | 546→546 |
| `scores/ru_yuan_01.m3n` | 642→642 | 714→714 |
| `scores/san_bu_01.m3n` | 534→534 | 528→528 |
| `scores/san_tao_che_01.m3n` | 534→540 | 540→540 |
| `scores/scarborough_fair_01.m3n` | 528→528 | 528→528 |
| `scores/sea_horses_01.m3n` | 540→546 | 564→564 |
| `scores/second_waltz_01.m3n` | 540→528 | 558→558 |
| `scores/shi_jie_zeng_yu_wo_de_01.m3n` | 612→612 | 654→654 |
| `scores/si_le_dou_yao_ai_01.m3n` | 594→594 | 642→642 |
| `scores/song_bie_01.m3n` | 528→528 | 528→528 |
| `scores/sound_of_silence_01.m3n` | 528→528 | 528→528 |
| `scores/su_shan_na_01.m3n` | 528→528 | 576→576 |
| `scores/ta_shuo_01.m3n` | 654→654 | 666→672 |
| `scores/tai_yang_zhao_chang_sheng_qi_01.m3n` | 528→534 | 528→528 |
| `scores/the_internationale_01.m3n` | 552→552 | 564→564 |
| `scores/tian_hei_hei_01.m3n` | 576→576 | 642→642 |
| `scores/tie_xue_dan_xin_01.m3n` | 528→552 | 528→528 |
| `scores/ting_hai_01.m3n` | 588→588 | 642→642 |
| `scores/tong_hua_zhen_01.m3n` | 648→648 | 702→702 |
| `scores/tong_zhuo_de_ni_01.m3n` | 528→552 | 564→564 |
| `scores/tu_ran_hao_xiang_ni_01.m3n` | 672→672 | 708→708 |
| `scores/turkish_march_01.m3n` | 684→684 | 756→756 |
| `scores/valsentino_01.m3n` | 768→768 | 768→768 |
| `scores/wen_rou_de_qing_su_01.m3n` | 528→528 | 528→528 |
| `scores/what_a_wonderful_world_01.m3n` | 528→534 | 528→528 |
| `scores/wo_de_zu_guo_01.m3n` | 528→528 | 564→564 |
| `scores/wo_he_ni_01.m3n` | 528→528 | 534→534 |
| `scores/wo_he_wo_de_zu_guo_01.m3n` | 528→534 | 600→600 |
| `scores/wo_niu_yu_huang_li_niao_01.m3n` | 528→528 | 528→528 |
| `scores/wo_yao_ni_01.m3n` | 528→528 | 546→546 |
| `scores/wo_zhi_zai_hu_ni_01.m3n` | 528→534 | 528→528 |
| `scores/xi_huan_ni_01.m3n` | 528→534 | 558→558 |
| `scores/xia_yu_de_shi_hou_01.m3n` | 528→528 | 528→570 |
| `scores/xiang_si_01.m3n` | 528→528 | 540→540 |
| `scores/xiao_hong_mao_01.m3n` | 528→552 | 528→528 |
| `scores/xiao_xing_xing_01.m3n` | 528→528 | 528→528 |
| `scores/xiao_ye_qu_01.m3n` | 528→546 | 534→534 |
| `scores/xin_bu_liao_qing_01.m3n` | 534→540 | 540→540 |
| `scores/xing_xing_dian_deng_01.m3n` | 762→762 | 570→570 |
| `scores/yan_hua_yi_leng_01.m3n` | 570→570 | 618→618 |
| `scores/yang_cong_01.m3n` | 612→612 | 660→660 |
| `scores/yi_qian_ge_shang_xin_de_li_you_01.m3n` | 606→606 | 654→654 |
| `scores/yong_yuan_tong_zai_01.m3n` | 528→546 | 540→552 |
| `scores/you_raise_me_up_01.m3n` | 540→576 | 708→708 |
| `scores/yu_jian_01.m3n` | 528→534 | 576→576 |
| `scores/yue_ban_xiao_ye_qu_01.m3n` | 600→600 | 636→636 |
| `scores/yue_ding_01.m3n` | 534→546 | 570→570 |
| `scores/yue_liang_dai_biao_wo_de_xin_01.m3n` | 534→540 | 534→534 |
| `scores/zhi_ai_li_si_01.m3n` | 594→594 | 600→606 |
| `scores/zhi_dao_shi_jie_de_jin_tou_01.m3n` | 528→540 | 546→552 |
| `scores/zhui_meng_ren_01.m3n` | 528→528 | 576→576 |
| `scores/zui_chang_de_dian_ying_01.m3n` | 534→534 | 588→588 |
| `works/snail-mushroom-waves.m3n` | 606→606 | 666→666 |
| `examples/huan_le_song.m3n` | 528→534 | 528→546 |

原始选宽报告：`.tmp/uniformity-row-numbered/report.json`、`.tmp/uniformity-row-staff/report.json`；基线对应 `.tmp/comfort-after-*/report.json`。

## 回归范围

评分回归覆盖舒适区边界、逐间隔计算后平均、零代价参与分母、尺度一致、均匀度独立参与排名，以及少量极端拉伸与微小字号收益的竞争。行间均匀度与逐间隔舒适度分开取样，两种谱式传入各自行的原有单位节奏间距，算法只在共享层实现一次。

首次直接按每个音符间隔恢复均匀度时，固定640px的《过火》《基本功》《你是我心爱的姑娘》增加过多谱行，原有密度门禁失败；恢复行间口径后10组真实字体密度门禁全部通过，未放宽原有行数、高度、字号和墨迹阈值。记录位于 `.tmp/uniformity-row-density/report.json`。

最终单元测试通过：领域314项、简谱1185项、渲染420项、应用516项，另有选宽工具49项、PDF字体4项、托管5项；包边界与lint通过。117首×两种谱式在各自实际选宽下逐份执行墨迹审计，234份结果均无越界、无碰撞，并与选宽报告的页数、行数一致；基本功实际小节分组也单独断言。记录位于 `.tmp/uniformity-row-winner-audit/report.json`。所有重检查串行运行，单worker、受限Node堆与聚合RSS监控均启用。

`prepare:scores`、生成物新鲜度校验及 `/score/` 路径隔离生产构建通过；最终审计、生成与构建批次聚合RSS峰值1451MiB，低于工作区2GB上限。
