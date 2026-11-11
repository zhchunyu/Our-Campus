# V8 提取 LoRA —— 上传包说明

> 这是「两个独立适配器」中的**第一个：事件结构化提取 LoRA**。
> 另一个（人设化回应）见 `v7_upload/`。两者分开训、分开存，部署时用 vLLM
> `--enable-lora` 同时挂载。

---

## 一、包内文件

| 文件 | 上传到 | 说明 |
|---|---|---|
| `v8_extract_train.json` | `/root/autodl-tmp/data/` | 训练集 **1214 条** |
| `v8_extract_eval.json` | `/root/autodl-tmp/data/` | 评估集 **134 条**（与训练集零交集） |
| `dataset_info.json` | `/root/autodl-tmp/data/` | **覆盖原来的**（已加 `auv_v8_extract` / `auv_v8_extract_eval`） |
| `v8_extract.yaml` | `/root/autodl-tmp/` | 训练配置 |
| `upload_v8.py` | 不用上传 | 一键 scp 脚本 |

---

## 二、数据集从哪来（重要）

**不是重新造的，是把 `v3_train.json` 修补出来的。** 诊断结论：

v3 的问题只有两个，底子是好的：

| 问题 | 数量 | 处理 |
|---|---|---|
| 完全重复 | 182 条（11.9%） | 去重，保留首条 |
| 安全类 advice 与事件语义错配 | 984 条被重绑 | 按事件语义重新绑定（施工配"建议绕行"而非"雨雪路滑"） |
| description 是套话（"{建筑}存在安全隐患，请注意"） | 744 条被重写 | 换成具体描述（"垂直书院围栏破损，存在安全隐患"） |

保留的资产：**1214 条唯一 input 句式**、五类均衡、100% JSON 可解析。

> 如果重建，会丢掉 v3 这批丰富句式 —— 这是当初决定"修补不重建"的原因。

### 修补前后对比

| 指标 | v3 | v8 |
|---|---|---|
| 条数 | 1530 | 1348（去重后） |
| 唯一 input | 1348 | 1348 |
| advice 种类 | 69（大量 `random.choice` 复用） | **83** |
| description 套话残留 | 大量 | **0** |
| description 唯一值 | — | 1068 / 1348（79%） |
| 评估集 | 无 | 134 条 |

### 最终校验（全通过）

```
训练集 1214 / 评估集 134
训练唯一 input: 1214/1214
训练评估交集: 0
缺字段: 无
非法 type:0  severity:0  time_window:0
building_id 缺失:0
description 套话残留: 0
```

---

## 三、和 V7 的关键区别（为什么超参不一样）

| 项 | V7（人设回应） | V8（提取） | 原因 |
|---|---|---|---|
| `learning_rate` | 1.0e-4 | 1.0e-4 | 提取输出是严格 JSON，token 级精确要求更高，不能更高 |
| `num_train_epochs` | 3.0 | **2.0** | 提取任务更容易过拟合，少跑一轮 |
| `cutoff_len` | 1024 | **512** | 输入约 30 字、输出约 200 字，512 足够 |
| `per_device_train_batch_size` | 2 | **4** | 样本短，显存压力小，可加大 batch |
| `gradient_accumulation_steps` | 8 | **4** | 保持等效 batch = 16 |

**评估看什么**：提取任务的 loss 不是好指标 —— 要看「JSON 可解析率」和字段准确率。
`do_eval: true` 已开，每 100 步评一次；但真正验收要抽样人工核对。

### ★★ 训练中途怎么判断该不该加 epoch

V8 总步数 ≈ 1214 ÷ (batch 4 × grad_accum 4) × 2 epoch ≈ **152 步**，所以中间会打 **1 次** eval（100 步）。
epoch 只设了 2 轮 —— 这是保守值，提取任务更容易过拟合。跑完看：

```bash
cat /root/autodl-tmp/output/qwen25-14b-auv-v8-extract/trainer_state.json | python -c "
import json,sys
d=json.load(sys.stdin)
for x in d['log_history']:
    if 'eval_loss' in x:
        print(f\"step {x['step']:4d}  eval_loss={x['eval_loss']:.4f}\")
    elif 'loss' in x and x['step']%25==0:
        print(f\"step {x['step']:4d}  train_loss={x['loss']:.4f}\")
"
```

| 观察 | 含义 | 该做什么 |
| --- | --- | --- |
| train_loss 末段**还在明显下降** | 没练够 | `num_train_epochs: 3.0` 再来一轮 |
| train_loss **走平**，eval 同步走平 | ✅ 收敛 | 直接用 |
| eval_loss **先降后升** | 过拟合 | 回退到 loss 最低的 checkpoint |

> ★ 提取任务的过拟合信号比回应任务更隐蔽 —— 因为 loss 会降得很好看，但模型
> 只是在背 JSON 模板。**唯一可靠的检查是抽样跑真实输入，看字段值对不对。**

### ★★ 提取任务的真实验收（不是 loss）

```bash
python - <<'EOF'
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import json, torch

base = "/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master"
tok = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
m = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.float16,
                                         device_map="auto", load_in_4bit=True)
m = PeftModel.from_pretrained(m, "/root/autodl-tmp/output/qwen25-14b-auv-v8-extract")
m.eval()

instr = json.load(open("/root/autodl-tmp/data/v8_extract_train.json"))[0]["instruction"]
tests = [
    "第一食堂现在人多到爆，队都排到门口了",
    "图书馆三楼空调外机看着要掉",
    "有没有人今晚一起去操场跑步的",
]
ok = 0
for t in tests:
    p = tok.apply_chat_template([{"role":"system","content":instr},{"role":"user","content":t}],
                                tokenize=False, add_generation_prompt=True)
    ids = tok(p, return_tensors="pt").to(m.device)
    with torch.no_grad():
        o = m.generate(**ids, max_new_tokens=256, do_sample=False,
                       pad_token_id=tok.eos_token_id)
    r = tok.decode(o[0][ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    print(f"\n输入: {t}\n输出: {r}")
    try:
        d = json.loads(r); print("  ✅ JSON 可解析 | type =", d.get("type"))
        ok += 1
    except Exception as e:
        print("  ❌ JSON 解析失败:", e)
print(f"\nJSON 可解析率: {ok}/{len(tests)}")
EOF
```

**判据**：JSON 可解析率应 **≥ 90%**。低于此说明模板没学牢，要加 epoch 或提高 lr。
再看字段：`type` 是否分对、`building_name` 是否落在校园真实建筑名里。

---

## 四、上传与训练

### 方式 A：一键脚本

```bash
python upload_v8.py
# 按提示输入 AutoDL 的 SSH 地址和端口
```

或在脚本顶部 `DEFAULT_HOST` / `DEFAULT_PORT` 里填死后直接跑。

### 方式 B：手动

```bash
scp -P <端口> v8_extract_train.json v8_extract_eval.json dataset_info.json root@<地址>:/root/autodl-tmp/data/
scp -P <端口> v8_extract.yaml root@<地址>:/root/autodl-tmp/
```

### 训练

```bash
cd /root/autodl-tmp
llamafactory-cli train v8_extract.yaml
```

输出在 `/root/autodl-tmp/output/qwen25-14b-auv-v8-extract`。

---

## 五、两个 LoRA 怎么用

训练顺序建议：**先训提取（V8），再训回应（V7）**。因为提取是产品链路的
第一环，先确保它可用。

部署（vLLM）：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
  --enable-lora \
  --lora-modules extract=/root/autodl-tmp/output/qwen25-14b-auv-v8-extract \
                 persona=/root/autodl-tmp/output/qwen25-14b-auv-v7 \
  --max-lora-rank 128
```

然后按请求指定 `model` 字段选适配器：
- 用户报事件 → `model: extract` → 拿到结构化 JSON
- 需要生成自然语言回应 → `model: persona`（把结构化结果作为输入）

> 两个适配器是**独立**的，不共享参数。想合并成一个可以后续用
> `llamafactory-cli export` 分别导出后手动 merge，但不建议 —— 分开才能单独迭代。
