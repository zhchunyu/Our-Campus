# V10 提取数据集上传包

> 生成日期：2026-10-04
> 目的：把地点体系从「旧校区」切换到**校园地点权威表**（去标识，66 地点）

---

## 一、这次改了什么

| # | 改动 | 数量 |
|---|---|---|
| 1 | **地点全面切换到权威表** | 全量 |
| 2 | A/B 组改名换 ID | 11 个名字 |
| 3 | C 组拍板落定 | 5 个名字 |
| 4 | D 组旧建筑删除（整句丢弃） | 20 个名字 / 564 条 |
| 5 | instruction 补 `building_id` 说明 | — |
| 6 | **去标识**（零校名） | 全量 |

**C 组拍板结果**（若与你判断不符，改 `data/build_v10_extract.py` 的 `C_GROUP` 后重跑）：

| 旧名 | 新名 | 新 id |
|---|---|---|
| A教学楼 | 崇学楼 | `teaching-a` |
| B教学楼 | 教学主楼 | `main-teaching-building` |
| C实验楼 | 实验大楼 | `lab-building` |
| 学术报告厅 | 崇文楼 | `chongwen-building` |
| 行政楼 | 教学管理楼 | `teaching-management-building` |

---

## 二、★★ 数据量掉了，这是预期内的

```
V9：训练 983 + 评估 120 = 1103 条
V10：训练 419 + 评估 120 =  539 条   ← 掉 51%
```

**原因**：V9 的数据是照旧校区写的，20 个地标建筑（知谷 / 垂直书院 / 暖廊 / 中轴路…）
在权威表里根本不存在，只能整句丢弃。

**★ 这就是「覆盖率只有 24%」的实际代价。**

### 提高数据的两个办法

| 办法 | 收益 | 代价 |
|---|---|---|
| **A. 补录 9 个地点到权威表** | 救回 **248 条** → 数据集 **667 条** | 要改线上数据库 |
| **B. 按权威表重造数据（方案 C）** | 覆盖率 24% → 100% | 工作量最大，效果最好 |

补录清单（能救回 248 条）：

| 建议 id | name | category | 能救回 |
|---|---|---|---|
| `training-center` | 工程训练中心 | service | 35 |
| `student-center` | 学生活动中心 | service | 30 |
| `express-center` | 快递服务中心 | service | 29 |
| `south-dorm` | 南区宿舍 | living | 28 |
| `bathhouse` | 公共浴室 | service | 28 |
| `south-gate` | 南校门 | transport | 27 |
| `main-gate` | 主校门 | transport | 24 |
| `print-shop` | 校园打印店 | service | 22 |
| （另）| 大学生活动中心 | service | 25 |

---

## 三、文件清单

```
v10_upload/
├── v10_extract.yaml              # LLaMA-Factory 训练配置
├── campus_locations.json         # ★ 地点权威表（去标识，66 地点）
├── upload_v10.py                 # 上传脚本（本地跑）
├── check_v10.py                  # 验收脚本（服务器跑）
├── README.md                     # 本文件
└── data/
    ├── v10_extract_train.json    # 419 条
    ├── v10_extract_eval.json     # 120 条
    └── dataset_info.json         # 已注册 auv_v10_extract / _eval
```

---

## 四、怎么跑

### 1. 上传（本地 Windows）

```bash
cd models/auv/model-finetune/v10_upload
python upload_v10.py <你的服务器地址> <端口>
```

★ `dataset_info.json` 会**覆盖**服务器上的同名文件。如果服务器上还有别的数据集要保留，先备份。

### 2. 训练（AutoDL 服务器）

```bash
cd /root/autodl-tmp
llamafactory-cli train v10_extract.yaml
```

### 3. 验收（训练完）

```bash
cd /root/autodl-tmp
python check_v10.py
```

★ `check_v10.py` 需要 `campus_locations.json` 在 `/root/autodl-tmp/` 下 —— 上传脚本已包含。

---

## 五、验收看什么

| 指标 | 判据 | 说明 |
|---|---|---|
| JSON 可解析率 | ≥ 90% | 模板没学牢就是这里挂 |
| type 准确率 | 越高越好 | 提取的核心能力 |
| null 正确率 | — | 文本没提地点时不编造 |
| **★ 地点合法率** | **应 100%** | **V10 核心目标：地点必须出自权威表** |

★★ **不要看 loss。** 提取任务的 eval_loss（V8 0.037 / V9 0.0379）是模板化 JSON 的产物，不反映质量。

**重点是「地点合法率」**：如果模型输出的地点不在权威表里（比如漏网输出了旧校区建筑名），
说明训练数据清理不彻底，或者旧名在 instruction 里还有残留。

---

## 六、接库时注意

★★ **后端必须以权威表为准，不能直接采信模型输出的 `building_name`。**

链路：

```
模型输出 building_name（候选）
   ↓
后端查「校园地点权威表」（campus_locations 的 name 或 aliases）
   ↓
查得到 → 用表里的真实 id + 坐标落图
查不到 → 丢弃，退回用发帖人 GPS / 地图选点
```

详见 `models/auv/model-finetune/地点字段处理约定.md`。
