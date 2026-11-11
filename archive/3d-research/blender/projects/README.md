# Blender 工程文件（.blend）

本目录的 24 个 `.blend` 场景工程文件**不在仓库树内**，而是以 **Release 资产**分发：

**下载 → https://github.com/zhchunyu/Chun-Yu/releases/tag/blend-projects**

## 为什么放在 Release

**原因一：GitHub API 的单请求体积限制。**
Git Data API（`/git/blobs`）与 Contents API 都有此限制。本仓库实测（2026-09-21）：

| 文件体积 | 请求体（base64 后） | 结果 |
| --- | --- | --- |
| 34 MB | 45 MB | ✅ HTTP 201 |
| 40 MB | 53 MB | ❌ HTTP 422 `input was too large to process` |
| 62 MB | 83 MB | ❌ HTTP 422 `input was too large to process` |

即**实际上限约 36 MB / 文件**，与"单文件 100 MB"的名义上限无关。
本目录 24 个 `.blend` 中有 16 个在 41.6~62.2 MB，无法进树。

**原因二：Release 资产名会被清洗掉所有非 ASCII 字符。**实测：

| 提交的名字 | 实际得到的名字 |
| --- | --- |
| `café.blend` | `cafe.blend` |
| `R0_垂直书院.blend` | `R0_.blend` |
| `山河大学_R0.blend` | `_R0.blend` |

所以资产名一律用 ASCII，中文原名见下表映射。

Release 资产走 `uploads.github.com`，**原始字节直传、不做 base64**，单文件上限 2 GB —— 这也是 GitHub 官方推荐的大二进制分发方式。

## 资产名映射

| Release 资产名（ASCII） | 原名 | 体积 | 说明 |
| --- | --- | --- | --- |
| `ShanHeU_R0_vertical_academy.blend` | `山河大学_R0_垂直书院.blend` | 34.3 MB | 语言样板：基座 42×42×11.25 + 塔身 9 层，总高 93.00 m |
| `ShanHeU_R1_gate_smart_valley.blend` | `山河大学_R1_山门智谷.blend` | 34.7 MB | 山门 116 m 跨变截面拱 + 下沉智谷（深 8 m） |
| `ShanHeU_R2_library_lecture_hall.blend` | `山河大学_R2_图书馆讲堂.blend` | 35.5 MB | 图书馆三层台地 + 变曲率薄壳；漂浮讲堂悬于水面 20.5 m |
| `ShanHeU_R3_humanities.blend` | `山河大学_R3_人文区.blend` | 41.6 MB | 大礼堂柱廊 pitch 5.40 + 筒壳；美术馆；书院 A/B/C |
| `ShanHeU_R4_smart_corridor.blend` | `山河大学_R4_智慧环廊.blend` | 48.3 MB | 全长 1631.9 m，18 顶点弧长参数化 |
| `ShanHeU_R5_five_zones.blend` | `山河大学_R5_五区.blend` | 62.0 MB | 22 栋，天际线五级 |
| `ShanHeU_R6_waterfront_podium.blend` | `山河大学_R6_滨水基座.blend` | 62.2 MB | 滨水基座 |
| `ShanHeU_site_skeleton.blend` | `山河大学_场地骨架.blend` | 62.0 MB | 阶段 0 场地骨架 |
| `ShanHeU_axis_sequence.blend` | `山河大学_中轴序列.blend` | 35.2 MB | 中轴序列 |
| `ShanHeU_axis_end.blend` | `山河大学_中轴尽端.blend` | 35.9 MB | 中轴尽端 |
| `ShanHeU_humanities_zone.blend` | `山河大学_人文区.blend` | 34.3 MB | 人文区早期版 |
| `teaching_main_building.blend` | `教学主楼.blend` | 6.8 MB | 教学主楼（已封存素材） |
| `archfix_r0.blend` / `archfix_r4.blend` / `archfix_r5.blend` | 同名 | 34.3 / 48.3 / 62.0 MB | 专项修复工程 |
| `AB_beam_base.blend` · `AB_beam_conc.blend` · `AB_beam_conc_thin.blend` · `AB_beam_thin.blend` · `AB_beam_light.blend` | 同名 | 48.3 MB | 环廊纵梁 A/B 量化验证 |
| `AB_palette.blend` | 同名 | 62.2 MB | 配色 A/B 量化验证 |
| `_tmp_r4_diag.blend` · `restore3.blend` · `haze_test.blend` | 同名 | 47.4 / 62.2 / 62.2 MB | 诊断与测试工程 |

## 重新生成（不依赖 Release）

全部 `.blend` 均可由脚本重新生成：

```bash
cd 02-三维资产/blender
BR_CFG_FILE=configs/r0.json "C:/Users/31967/Blender/blender-4.5.9-windows-x64/blender.exe" \
  --background --factory-startup --python scripts/run_campus.py
```

配置累进链：`build_campus_site.py` → `stage1→2→3→r0→…→rN→palette_retune.py`（**配色重标恒为末项**）。

## 未收录

`.blend1` 自动备份（16 个 / 671 MB）未收录 —— 与对应 `.blend` 内容重复。
