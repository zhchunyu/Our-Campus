# V7 训练数据集 — 上传与训练说明

> 生成时间：2026-10-04
> 生成脚本：`../data/build_v7_dataset.py`

---

## 一、这套数据是什么

**AUV 校园实时态势助手的人设化回应数据。** 输入是校园场景/用户提问，输出是 AUV 的一段自然语言回应。

| 项 | 数值 |
| --- | --- |
| 训练集 `v7_train.json` | 1597 条 |
| 评估集 `v7_eval.json` | 145 条 |
| 合计 | 1742 条 |
| 输入去重 | 100%（0 条重复） |
| 平均输出长度 | 31 字 |

---

## 二、相对 V6 修了什么（重要）

V6 有 2296 条，但存在四个硬伤。V7 逐一修掉：

| 问题 | V6 | V7 |
| --- | --- | --- |
| **重复数据** | 387 条 input 完全重复（16.9%） | **0 条** |
| **思考链污染** | 99.7% 的 output 带 `【思考】` 块，线上必须写代码截断 | **0 条**，output 就是最终回应 |
| **书名硬引用** | output 里直接写"金字塔原理：先说结论" | **0 处**，改为能力描述 |
| **场景失衡** | 日程类灌水、情绪类占 11% | 按权重配比，日程 16.7%，情绪 5.7% |
| **无评估集** | `do_eval: false`，无法判断过拟合 | 有 145 条评估集，训练中每 100 步评估 |

**新增「空间行为诊断」类（104 条）** —— 这是 V7 最有价值的新增。基于《人性化的城市》《美国大城市的死与生》的空间行为判据（视线通透、照明、动线、停留理由、尺度、路权），对应产品核心功能「通行热度异常检测」。

---

## 三、上传方式

### 方式 A：一键脚本（推荐）

```bash
cd v7_upload
python upload_v7.py
```

按提示输入 AutoDL 的 SSH 地址和端口即可。脚本会自动建目录、传文件、验证。

### 方式 B：手动 scp

```bash
# 换成你自己的地址和端口
HOST=region-3.autodl.com
PORT=30512

ssh -p $PORT root@$HOST "mkdir -p /root/autodl-tmp/data"

scp -P $PORT v7_train.json v7_eval.json dataset_info.json root@$HOST:/root/autodl-tmp/data/
scp -P $PORT v7_train.yaml root@$HOST:/root/autodl-tmp/
```

### 方式 C：JupyterLab 拖拽

把 4 个文件分别拖到对应目录：
- `v7_train.json` / `v7_eval.json` / `dataset_info.json` → `/root/autodl-tmp/data/`
- `v7_train.yaml` → `/root/autodl-tmp/`

> ⚠️ `dataset_info.json` 是**覆盖**原来的。新版里保留了 `campus_event_extraction`、`campus_event_test`、`auv_persona` 三条，不影响你已有的实验。

---

## 四、开始训练

```bash
cd /root/autodl-tmp
llamafactory-cli train v7_train.yaml
```

输出权重在 `/root/autodl-tmp/output/qwen25-14b-auv-v7/`。

**预计耗时**：1597 条 × 3 epoch，14B QLoRA，约 3~6 小时（视显卡）。

---

## 五、超参说明（为什么这么改）

| 参数 | V6 | V7 | 原因 |
| --- | --- | --- | --- |
| `learning_rate` | 2e-4 | **1e-4** | V6 的 2e-4 是 v5（3e-5）的 6.7 倍，对 14B+rank128 过高，极易发散或灾难性遗忘。1e-4 是 QLoRA 大模型的常用上限 |
| `cutoff_len` | 2048 | **1024** | V7 样本平均 31 字（约 60 token），2048 纯浪费显存 |
| `do_eval` | false | **true** | 不评估就不知道是否过拟合 |
| `double_quantization` | 无 | **true** | 进一步省显存，几乎无精度损失 |
| `save_strategy` | epoch | epoch | 保留（每 epoch 存一次） |

---

## 六、训练后怎么验证

```bash
llamafactory-cli webchat \
  --model_name_or_path /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
  --adapter_name_or_path /root/autodl-tmp/output/qwen25-14b-auv-v7 \
  --template qwen \
  --finetuning_type lora
```

**重点测这几条**（V7 的新增能力）：

```
用户说：图书馆东侧那条小路傍晚几乎没人走
用户说：一食堂现在人多吗
用户说：我室友半夜不睡很吵
用户说：我明天上午有课吗
```

预期：第一条应该能给出**基于空间判据的分析**（视线、照明、绕行距离），而不是泛泛而谈。

---

## 七、怎么判断训练效果好不好

### 7.1 先看 `train_loss` vs `eval_loss` 的关系

| 现象 | 说明 | 对策 |
| --- | --- | --- |
| **eval_loss < train_loss** | ✅ 健康（没练坏） | 直接用 |
| eval_loss ≈ train_loss | ✅ 正常 | 直接用 |
| eval_loss > train_loss 且差距扩大 | ❌ 过拟合 | 降 epoch / 降 lr / 减 lora_rank |
| 两个都不降 | ❌ 欠拟合 | 提高 lr 到 1.5e-4，加 epoch |

> ★★ **别拿这两个数直接比大小**。`train_loss` 是**全程平均值**（含早期高位），
> `eval_loss` 是**训练结束后的单次评估**，天生偏低一点。真正有意义的是**下图那条曲线**。

### 7.2 ★★ 关键：看中间 eval 的**曲线形态**

`eval_steps: 100`，V7 总步数 ≈ 300，所以中间会打 3 次 eval。**这 3 个值决定结论**：

```bash
# 把中间几次 eval 拉出来
cat /root/autodl-tmp/output/qwen25-14b-auv-v7/trainer_state.json | python -c "
import json,sys
d=json.load(sys.stdin)
for x in d['log_history']:
    if 'eval_loss' in x:
        print(f\"step {x['step']:4d}  eval_loss={x['eval_loss']:.4f}\")
"
```

| 曲线形态 | 含义 | 该做什么 |
| --- | --- | --- |
| 0.29 → 0.26 → 0.25（**持续下降**） | 还没练够 | epoch 提到 4~5 |
| 0.25 → 0.25 → 0.25（**持平**） | ✅ 已收敛 | 直接用 |
| 0.24 → 0.26 → 0.25（**先降后升**） | 开始过拟合 | 回退到 loss 最低那个 checkpoint |

> checkpoint 存在 `output_dir/checkpoint-xxx`，最低点那个就是最优权重。

### 7.3 ★★★ loss 只是体检，不是验收

`loss` 只能告诉你"有没有练坏"，**不能告诉你"练得好不好"**。人设回应 LoRA
真正要看的是**生成质量**。跑对比脚本：

```bash
pip install peft
python eval_output.py \
  --base /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
  --lora /root/autodl-tmp/output/qwen25-14b-auv-v7
```

它会用同一批 10 条输入分别跑「基础模型」和「LoRA」，并自动质检（思考链/书名/破功/串味）。

**人工重点看三条**：
1. 有没有**具体动作**（vs "建议错峰" 这类空话）
2. 语气像不像**校园同伴**（vs 客服腔 / 教科书腔）
3. LoRA 相比 base 是**明显变好**，还是只是**变啰嗦**了

### 7.4 常见坏味道

| 现象 | 对策 |
| --- | --- |
| 输出里出现"我是AI助手" | 忘了人设 → 提高 lora_rank，或加 epoch |
| 回复变成背书、大量重复训练集句子 | 过拟合 → 降 lr 到 5e-5，减 epoch |
| 输出格式乱（带字段名、带括号） | instruction 没约束住 → 检查数据是否混入别的 instruction |
| 输出像 JSON（串味） | **两个 LoRA 混用错了** → 检查 `model` 字段选的是 extract 还是 persona |

> ⚠️ **`eval_output.py` 需在本机装 `peft` 后运行**；脚本默认会去当前目录
> 找 `v7_eval.json` 取 instruction，找不到会提示并降级。

---

## 八、文件清单

| 文件 | 上传到 | 说明 |
| --- | --- | --- |
| `v7_train.json` | `/root/autodl-tmp/data/` | 训练集 1597 条 |
| `v7_eval.json` | `/root/autodl-tmp/data/` | 评估集 145 条 |
| `dataset_info.json` | `/root/autodl-tmp/data/` | 数据集注册（覆盖原文件） |
| `v7_train.yaml` | `/root/autodl-tmp/` | 训练配置 |
| `upload_v7.py` | 本地运行 | 一键上传脚本 |
| `eval_output.py` | 服务器运行 | **训练前后生成质量对比 + 自动质检**（不看 loss） |
