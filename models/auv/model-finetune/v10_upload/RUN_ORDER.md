# V10 终端执行顺序

> 生成：2026-10-05
> ★★ **所有服务器命令都必须在 `/root/autodl-tmp` 下跑。**
> 下面**每一块都已自带 `cd`**，从任意目录直接复制粘贴都不会错。

---

## 第 0 步 · 上传（本地 Windows 终端）

```bash
cd "C:/Users/31967/Desktop/全国人工智能精英算法大赛/春雨工作区/models/auv/model-finetune/v10_upload"
python upload_v10.py <服务器地址> <端口>
```

例：`python upload_v10.py region-1.autodl.com 12345`

共传 10 个文件，其中 `campus_locations.json` **传两份**（`/root/autodl-tmp/` 和 `/root/autodl-tmp/data/`）——
`check_v10.py` 和 `check_db_match.py` 的路径口径不一样，各要一份。

⚠️ `dataset_info.json` 会**覆盖**服务器同名文件。若服务器上还有别的数据集，先备份。

---

## 第 1 步 · 确认文件到位（服务器）

```bash
cd /root/autodl-tmp && ls -1 v10_extract.yaml campus_locations.json check_v10.py check_ai_value.py check_db_match.py data/v10_extract_train.json data/v10_extract_eval.json data/dataset_info.json data/campus_locations.json
```

**应看到 9 行、无 `No such file`。** 缺哪个就回第 0 步重传。

---

## 第 2 步 · 核对模型路径

```bash
cd /root/autodl-tmp && ls -d models/models/*Qwen2.5-14B* 2>/dev/null || echo "★ 路径不对"
```

- 打印出路径 → 对一下是不是 `models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master`，不是就改下面三处常量
- 打印「★ 路径不对」→ 把实际路径填进这三处（**同一个值**）：
  `check_v10.py:39` · `check_ai_value.py:40` · `v10_extract.yaml:36`

---

## 第 3 步 · 训练

```bash
cd /root/autodl-tmp && nohup llamafactory-cli train v10_extract.yaml > train.log 2>&1 &
```

看进度：

```bash
cd /root/autodl-tmp && tail -f train.log
```

`Ctrl+C` 只退出 `tail`，训练不受影响。约 419 条 × 2 epoch，视卡型 30~90 分钟。
输出落在 `/root/autodl-tmp/output/qwen25-14b-auv-v10-extract/`。

**★ 不要盯 loss。** 提取任务的 loss 是模板化 JSON 的产物，不反映质量。

---

## 第 4 步 · 验收（训练完）

```bash
cd /root/autodl-tmp && python check_v10.py
```

看四个数：

| 指标 | 判据 | 挂了说明什么 |
|---|---|---|
| JSON 可解析率 | ≥ 90% | 模板没学牢 |
| type 准确率 | 越高越好 | 提取核心能力 |
| null 正确率 | 高 | 没提地点时不编造 |
| **★ 地点合法率** | **应 100%** | **V10 唯一核心目标** |

若打印「⚠️ 找不到权威表」⇒ 回第 1 步，`campus_locations.json` 没传到根目录。

---

## 第 5 步 · 三路对比（★ 决定「还要不要训」的一步）

```bash
cd /root/autodl-tmp && python check_ai_value.py
```

★ 这一步**不需要 V10 数据**（取不到训练集会自动退回内置提示词），所以现在就能跑。

输出一张 3 行汇总表：

```
路线        type     wait   window severity     平均
正则       9/10    10/10     9/10     5/10      82%
基础模型   ...
LoRA       ...
```

**怎么读：**

| 现象 | 结论 |
|---|---|
| 某字段**正则**就 ≥90% | 该字段不需要 AI，删掉省算力 |
| **基础模型**高、LoRA 差不多 | 现成模型够用，**不用训** |
| **LoRA 明显 > 基础模型**（+20pt） | 这才是训练的价值 |
| 四列全都差不多 | **不用训**，停掉 V10 |

---

## 第 6 步 · 把结果贴回来

把第 4 步的四个数 + 第 5 步的汇总表贴给我，我给结论：
**训 / 不训 / 只训哪几个字段 / 哪个字段该砍**。

---

## 附 · 常见报错

| 报错 | 原因与修法 |
|---|---|
| `FileNotFoundError: '/root/v10_extract.yaml'` | ★ 当前目录是 `/root`，没 cd 到 `/root/autodl-tmp`。**用上面的命令块（自带 cd）** |
| `No such file: .../snapshots/master` | 基础模型路径不对 → 第 2 步 |
| `load_in_4bit is not supported` | 已用 `BitsAndBytesConfig` 兼容；若仍报 → `pip install -U transformers bitsandbytes` |
| `CUDA out of memory` | 改 `v10_extract.yaml`：`per_device_train_batch_size: 4` → `2` |
| `check_v10.py` 打印「⚠️ 找不到权威表」 | `campus_locations.json` 没传到根目录 → 第 0 步重传 |
