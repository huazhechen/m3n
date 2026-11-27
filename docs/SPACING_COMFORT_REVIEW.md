# 逐间隔舒适区评分对照

基线为 `7c3d71c9`。前后使用相同117份谱源、共享曲库TTF、528～768px候选范围及生产剪枝／局部6px细搜。简谱均启用数值几何；两种谱式串行测量，前后分别新建浏览器与排版任务，不复用持久选宽缓存。全部谱源SHA-256逐项一致。局部细搜不是全范围6px网格最优性的证明。

## 规则

舒适下限为紧／松档平均，上限为松档1.5倍：简谱12～24px，五线谱0.9～1.8谱间。每个净空先按时值与连组权重归一化，再独立计算 `max(0,L/g-1)²` 和 `max(0,g/U-1)²`；跨全曲所有有效间隔平均，零代价同样参与分母。两项系数均为1。均匀度仅保留诊断，最终总分为拥挤＋过疏＋原字体代价＋原溢出代价。

页数仍最优先，内部断行目标、精确几何和末行缩短规则保持原样。策略版本从v36升为v37，避免旧评分缓存命中。

## 全库结果

| 谱式 | 选宽变窄 | 不变 | 变宽 | 最大变窄／变宽 | 页数变化 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 简谱 | 76 | 38 | 3 | 120／6px | 0 |
| 五线谱 | 67 | 17 | 33 | 204／48px | 0 |

简谱总行数1003→1072，45首增加行数；五线谱785→897，77首增加行数。其余曲目行数不变。新规则的取舍是更大字号和舒适间隔可能同时需要更多谱行；全部作品页数保持原值。

原始报告：`.tmp/comfort-before-numbered/report.json`、`.tmp/comfort-after-numbered/report.json`，五线谱对应`before-staff`／`after-staff`。

## 重点曲目

| 曲目 | 简谱选宽／行数 | 简谱字号变化 | 五线谱选宽／行数 |
| --- | ---: | ---: | ---: |
| 梦幻曲 | 582／6 → 528／8 | +10.23% | 588／4 → 528／6 |
| 一步之遥 | 552／7 → 528／9 | +4.55% | 558／5 → 528／6 |
| 爱的礼赞 | 564／11 → 540／12 | +4.44% | 528／9 → 534／9 |
| 第二圆舞曲 | 564／13 → 540／13 | +4.44% | 528／9 → 558／10 |
| 深情的吻 | 576／13 → 558／13 | +3.23% | 540／10 → 528／11 |
| 惊愕交响曲·小步舞曲 | 540／6 → 528／6 | +2.27% | 528／4 → 528／5 |

《梦幻曲》新选528px，逐间隔拥挤与过疏代价均为零。其简谱从6行变为8行，《一步之遥》从7行变为9行；更松的间距档位与更大字号共同组成新赢家，两首均仍为单页。《一步之遥》新选528px，拥挤代价为零，少量过疏代价约0.0043；继续缩小字体的收益已不足以抵消字体代价。平均间距不再用于判断舒适与否。

## 完整选宽表

所有数值为逻辑px；字号与版宽成反比。两种谱式的117首作品页数均未变化。

| 谱源 | 简谱修改前 | 简谱修改后 | 五线谱修改前 | 五线谱修改后 |
| --- | ---: | ---: | ---: | ---: |
| `scores/ai_de_li_zan_01.m3n` | 564 | 540 | 528 | 534 |
| `scores/ai_er_lan_hua_mei_01.m3n` | 546 | 528 | 642 | 528 |
| `scores/ai_ru_chao_shui_01.m3n` | 678 | 666 | 714 | 726 |
| `scores/an_xiang_01.m3n` | 696 | 666 | 648 | 678 |
| `scores/annie_01.m3n` | 612 | 552 | 666 | 570 |
| `scores/auld_lang_syne_01.m3n` | 528 | 528 | 546 | 594 |
| `scores/autumn_leaves_01.m3n` | 582 | 528 | 528 | 546 |
| `scores/badinerie_bwv1067_01.m3n` | 546 | 528 | 558 | 528 |
| `scores/bai_hua_lin_01.m3n` | 582 | 564 | 624 | 600 |
| `scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n` | 744 | 738 | 600 | 606 |
| `scores/beer_barrel_polka_01.m3n` | 528 | 528 | 570 | 552 |
| `scores/bei_jia_er_hu_pan_01.m3n` | 612 | 576 | 594 | 564 |
| `scores/besame_mucho_01.m3n` | 576 | 558 | 540 | 528 |
| `scores/butter_fly_01.m3n` | 588 | 540 | 528 | 570 |
| `scores/cai_yun_zhui_yue_01.m3n` | 588 | 528 | 552 | 546 |
| `scores/canon_01.m3n` | 666 | 642 | 582 | 618 |
| `scores/castle_in_the_sky_01.m3n` | 528 | 528 | 528 | 528 |
| `scores/cha_er_da_shi_01.m3n` | 594 | 564 | 600 | 624 |
| `scores/chong_er_fei_01.m3n` | 534 | 528 | 630 | 528 |
| `scores/dan_huang_guan_bo_er_ka_01.m3n` | 558 | 552 | 570 | 582 |
| `scores/dang_nian_qing_01.m3n` | 588 | 534 | 690 | 534 |
| `scores/duo_lai_mi_01.m3n` | 582 | 528 | 600 | 534 |
| `scores/feng_01.m3n` | 762 | 762 | 648 | 600 |
| `scores/flower_dance_01.m3n` | 624 | 618 | 732 | 624 |
| `scores/fly_me_to_the_moon_01.m3n` | 546 | 528 | 612 | 546 |
| `scores/g_xian_shang_de_yong_tan_diao_01.m3n` | 588 | 528 | 576 | 534 |
| `scores/guang_yin_de_gu_shi_01.m3n` | 552 | 528 | 648 | 540 |
| `scores/guo_huo_01.m3n` | 684 | 564 | 636 | 636 |
| `scores/haydn_surprise_minuet_01.m3n` | 540 | 528 | 528 | 528 |
| `scores/hei_se_you_mo_01.m3n` | 708 | 708 | 744 | 750 |
| `scores/hong_he_gu_01.m3n` | 540 | 534 | 690 | 528 |
| `scores/hong_mei_hua_er_kai_01.m3n` | 594 | 546 | 570 | 534 |
| `scores/hou_hui_wu_qi_01.m3n` | 660 | 648 | 660 | 684 |
| `scores/hou_lai_01.m3n` | 702 | 702 | 750 | 768 |
| `scores/huan_le_song_01.m3n` | 528 | 528 | 624 | 528 |
| `scores/huang_hun_01.m3n` | 528 | 528 | 690 | 528 |
| `scores/jiu_er_01.m3n` | 558 | 528 | 528 | 564 |
| `scores/katyusha_01.m3n` | 528 | 528 | 648 | 528 |
| `scores/lao_nan_hai_01.m3n` | 654 | 648 | 702 | 672 |
| `scores/li_hua_you_kai_fang_01.m3n` | 618 | 528 | 594 | 540 |
| `scores/liang_liang_01.m3n` | 600 | 582 | 708 | 612 |
| `scores/liang_zhu_01.m3n` | 570 | 528 | 528 | 528 |
| `scores/long_long_ago_01.m3n` | 564 | 528 | 528 | 552 |
| `scores/ma_li_you_zhi_xiao_gao_yang_01.m3n` | 528 | 528 | 570 | 576 |
| `scores/man_bu_ren_sheng_lu_01.m3n` | 618 | 528 | 708 | 534 |
| `scores/man_man_xi_huan_ni_01.m3n` | 576 | 570 | 654 | 618 |
| `scores/mei_li_de_shen_hua_01.m3n` | 582 | 546 | 606 | 606 |
| `scores/meng_huan_qu_01.m3n` | 582 | 528 | 588 | 528 |
| `scores/ming_tian_hui_geng_hao_01.m3n` | 672 | 606 | 636 | 618 |
| `scores/mo_li_hua_01.m3n` | 528 | 528 | 666 | 540 |
| `scores/mo_si_ke_jiao_wai_de_wan_shang_01.m3n` | 600 | 528 | 642 | 534 |
| `scores/moon_river_01.m3n` | 540 | 528 | 606 | 540 |
| `scores/mozart_k545_01.m3n` | 588 | 588 | 672 | 624 |
| `scores/na_xie_nian_01.m3n` | 648 | 648 | 738 | 690 |
| `scores/ni_shi_wo_xin_ai_de_gu_niang_01.m3n` | 654 | 654 | 642 | 642 |
| `scores/over_the_rainbow_01.m3n` | 570 | 528 | 552 | 570 |
| `scores/por_una_cabeza_01.m3n` | 552 | 528 | 558 | 528 |
| `scores/qian_nv_you_hun_01.m3n` | 528 | 528 | 570 | 528 |
| `scores/qian_si_xi_01.m3n` | 600 | 600 | 648 | 672 |
| `scores/qing_niao_01.m3n` | 600 | 600 | 618 | 648 |
| `scores/qiu_ying_01.m3n` | 648 | 618 | 726 | 642 |
| `scores/rang_wo_men_dang_qi_shuang_jiang_01.m3n` | 564 | 528 | 528 | 558 |
| `scores/ren_shi_jian_01.m3n` | 606 | 606 | 642 | 648 |
| `scores/ru_guo_you_ni_zai_01.m3n` | 594 | 528 | 576 | 546 |
| `scores/ru_yuan_01.m3n` | 642 | 642 | 696 | 714 |
| `scores/san_bu_01.m3n` | 528 | 534 | 534 | 528 |
| `scores/san_tao_che_01.m3n` | 594 | 534 | 546 | 540 |
| `scores/scarborough_fair_01.m3n` | 528 | 528 | 528 | 528 |
| `scores/sea_horses_01.m3n` | 594 | 540 | 534 | 564 |
| `scores/second_waltz_01.m3n` | 564 | 540 | 528 | 558 |
| `scores/shi_jie_zeng_yu_wo_de_01.m3n` | 624 | 612 | 648 | 654 |
| `scores/si_le_dou_yao_ai_01.m3n` | 636 | 594 | 720 | 642 |
| `scores/song_bie_01.m3n` | 528 | 528 | 582 | 528 |
| `scores/sound_of_silence_01.m3n` | 528 | 528 | 636 | 528 |
| `scores/su_shan_na_01.m3n` | 528 | 528 | 534 | 576 |
| `scores/ta_shuo_01.m3n` | 654 | 654 | 672 | 666 |
| `scores/tai_yang_zhao_chang_sheng_qi_01.m3n` | 528 | 528 | 624 | 528 |
| `scores/the_internationale_01.m3n` | 576 | 552 | 696 | 564 |
| `scores/tian_hei_hei_01.m3n` | 606 | 576 | 642 | 642 |
| `scores/tie_xue_dan_xin_01.m3n` | 552 | 528 | 528 | 528 |
| `scores/ting_hai_01.m3n` | 588 | 588 | 672 | 642 |
| `scores/tong_hua_zhen_01.m3n` | 648 | 648 | 690 | 702 |
| `scores/tong_zhuo_de_ni_01.m3n` | 582 | 528 | 768 | 564 |
| `scores/tu_ran_hao_xiang_ni_01.m3n` | 672 | 672 | 720 | 708 |
| `scores/turkish_march_01.m3n` | 684 | 684 | 756 | 756 |
| `scores/valsentino_01.m3n` | 768 | 768 | 744 | 768 |
| `scores/wen_rou_de_qing_su_01.m3n` | 624 | 528 | 570 | 528 |
| `scores/what_a_wonderful_world_01.m3n` | 540 | 528 | 540 | 528 |
| `scores/wo_de_zu_guo_01.m3n` | 570 | 528 | 564 | 564 |
| `scores/wo_he_ni_01.m3n` | 576 | 528 | 528 | 534 |
| `scores/wo_he_wo_de_zu_guo_01.m3n` | 546 | 528 | 696 | 600 |
| `scores/wo_niu_yu_huang_li_niao_01.m3n` | 528 | 528 | 528 | 528 |
| `scores/wo_yao_ni_01.m3n` | 576 | 528 | 612 | 546 |
| `scores/wo_zhi_zai_hu_ni_01.m3n` | 528 | 528 | 648 | 528 |
| `scores/xi_huan_ni_01.m3n` | 546 | 528 | 540 | 558 |
| `scores/xia_yu_de_shi_hou_01.m3n` | 546 | 528 | 528 | 528 |
| `scores/xiang_si_01.m3n` | 558 | 528 | 594 | 540 |
| `scores/xiao_hong_mao_01.m3n` | 606 | 528 | 642 | 528 |
| `scores/xiao_xing_xing_01.m3n` | 528 | 528 | 528 | 528 |
| `scores/xiao_ye_qu_01.m3n` | 594 | 528 | 696 | 534 |
| `scores/xin_bu_liao_qing_01.m3n` | 528 | 534 | 606 | 540 |
| `scores/xing_xing_dian_deng_01.m3n` | 762 | 762 | 744 | 570 |
| `scores/yan_hua_yi_leng_01.m3n` | 600 | 570 | 618 | 618 |
| `scores/yang_cong_01.m3n` | 624 | 612 | 642 | 660 |
| `scores/yi_qian_ge_shang_xin_de_li_you_01.m3n` | 606 | 606 | 768 | 654 |
| `scores/yong_yuan_tong_zai_01.m3n` | 576 | 528 | 528 | 540 |
| `scores/you_raise_me_up_01.m3n` | 576 | 540 | 714 | 708 |
| `scores/yu_jian_01.m3n` | 534 | 528 | 666 | 576 |
| `scores/yue_ban_xiao_ye_qu_01.m3n` | 600 | 600 | 666 | 636 |
| `scores/yue_ding_01.m3n` | 576 | 534 | 690 | 570 |
| `scores/yue_liang_dai_biao_wo_de_xin_01.m3n` | 546 | 534 | 594 | 534 |
| `scores/zhi_ai_li_si_01.m3n` | 606 | 594 | 564 | 600 |
| `scores/zhi_dao_shi_jie_de_jin_tou_01.m3n` | 564 | 528 | 588 | 546 |
| `scores/zhui_meng_ren_01.m3n` | 528 | 528 | 582 | 576 |
| `scores/zui_chang_de_dian_ying_01.m3n` | 528 | 534 | 732 | 588 |
| `works/snail-mushroom-waves.m3n` | 660 | 606 | 666 | 666 |
| `examples/huan_le_song.m3n` | 528 | 528 | 528 | 528 |

## 验证

完整测试通过：领域层314、共享与简谱1183、五线谱420、应用516项；选宽49、字体4、托管5项通过。定向测试覆盖逐间隔、零代价分母、舒适区边界、全曲汇总及两种记谱接线。

固定640px密度回归初次仅Butter-Fly的旧11行门槛失败；新评分选择松档12行，连续高度698px仍满足原700px门槛。真实字体截图确认谱面后，仅将该曲行数门槛更新为12；高度、字体、其余密度及所有墨迹碰撞门槛均保持原值。其生产选宽为540px／11行。

固定宽度真实字体密度回归10组通过。按生产新选宽对117首逐曲检查两种谱式，共234份结果，分页、行数与选宽测量报告逐项一致，越界和碰撞均为零。报告位于 `.tmp/comfort-winner-audit/report.json`；密度报告位于 `.tmp/comfort-density-regression-final/report.json`。全部重检查使用聚合RSS监控、受限Node堆和单worker，串行执行。

生成物最终校验、依赖边界及lint通过；最终配置读取的五线谱定向测试与选宽工具测试通过。隔离的 `/score/` 路径生产构建通过，随后按提交版本发布到托管目录。
