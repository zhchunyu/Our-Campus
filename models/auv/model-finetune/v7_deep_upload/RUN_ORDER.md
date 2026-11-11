# V7-Deep 终端执行顺序

> 生成：2026-10-05
> ★★ **所有服务器命令都必须在 `/root/autodl-tmp` 下跑。**
> 下面**每一块都已自带 `cd`**，从任意目录直接复制粘贴都不会错。

---

## ⚠️ 开训前先定一件事：口吻

三套 instruction 现在是**专家助手口吻**（"你是校园空间诊断助手"），
V7 是 **AUV 同伴口吻**。产品是 C 端 App —— 用户问"图书馆东边那条路为啥没人走"，
AUV 该像同学还是像专家？

**口吻影响全部 228 条，训完再改等于白训。** 没定之前不要往下走。

---

## 第 0 步 · 上传（本地 Windows 终端）

```bash
cd "C:/Users/31967/Desktop/全国人工智能精英算法大赛/春雨工作区/models/auv/model-finetune/v7_deep_upload"
python upload_v7_deep.py --host <服务器地址> --port <端口>
```

不带参数运行会提示你输入。共传 6 个文件。

⚠️ `dataset_info.json` 是**覆盖**上传 —— 本包的版本已含现有 12 条注册 + 新增 2 条，不会破坏 v6~v10。

---

## 第 1 步 · 确认文件到位（服务器）

```bash
cd /root/autodl-tmp && ls -1 v7_deep_train.yaml check_v7_deep.py data/v7_deep_train.json data/v7_deep_eval.json data/dataset_info.json
```

**应看到 5 行、无 `No such file`。**

再确认数据集注册成功：

```bash
cd /root/autodl-tmp && python -c "
import json
d=json.load(open('data/dataset_info.json',encoding='utf-8'))
print('注册条目:', len(d))
print('本包新增:', [k for k in d if 'deep' in k])
print('auv_v7_deep ->', d['auv_v7_deep']['file_name'])
"
```

---

## 第 2 步 · 核对模型路径

```bash
cd /root/autodl-tmp && ls -d models/models/*Qwen2.5-14B* 2>/dev/null || echo "★ 路径不对"
```

不对就改这两处（**同一个值**）：`v7_deep_train.yaml:36` · `check_v7_deep.py:39`

---

## 第 3 步 · 训练

```bash
cd /root/autodl-tmp && nohup llamafactory-cli train v7_deep_train.yaml > train.log 2>&1 &
```

看进度：

```bash
cd /root/autodl-tmp && tail -f train.log
```

`Ctrl+C` 只退出 `tail`，训练不受影响。228 条 × 6 epoch，视卡型 20~60 分钟。
输出在 `/root/autodl-tmp/output/qwen25-14b-auv-v7-deep/`。

**★ 不要盯 loss。** 人设回应任务的 loss 只说明"有没有练坏"，不说明"练得好不好"。

---

## 第 4 步 · 验收（训练完）

```bash
cd /root/autodl-tmp && python check_v7_deep.py
```

跑 5 条能力测试，每条自动判定命中：

| # | 测什么 | 期望 |
|---|---|---|
| ① | 抓主导因素 | 指出"没有视线"是主因，照明只是加剧 |
| ② | 给数 + 写算式 | 给出约 22 分钟，并写出算式 |
| ③ | ★ **敢说「不需要处理」** | 五天数据在 ±6% 内 → 明确说"正常" |
| ④ | 看出点位转移 | 指出可能不是人少了，而是改道了 |
| ⑤ | 指出真瓶颈 | 指出瓶颈在"找件"，不在窗口数 |

**判据**：LoRA 命中 ≥4/5 ⇒ 形态对了，可以加量；<3/5 ⇒ **问题在数据形态，加量没用**。

★ **第 ③ 条最关键** —— 学不会说"不用处理"，说明模型只学会了"给结论"、
没学会"什么时候不给结论"，那这套数据的核心价值就没进去。

★ 想看训练到底有没有用：把 `check_v7_deep.py` 里的 `LORA` 改成 `None` 再跑一次，
对比基础模型的命中数。基础模型如果也能命中 4 条，说明训练收益有限。

---

## 第 5 步 · 可选：合并进 V7 再训一版

如果决定把它作为 V7 的增强（而不是独立模型）：

```bash
cd /root/autodl-tmp/data && python -c "
import json
a=json.load(open('v7_train.json',encoding='utf-8'))
b=json.load(open('v7_deep_train.json',encoding='utf-8'))
json.dump(a+b, open('v7_train_plus.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
print(len(a),'+',len(b),'=',len(a)+len(b))
"
```

→ 1597 + 206 = **1803 条**。

然后在 `data/dataset_info.json` 里加一条 `auv_v7_plus`（`file_name` 指向 `v7_train_plus.json`），
把 `v7_deep_train.yaml` 的 `dataset` 改成它，再跑第 3 步。

---

## 第 6 步 · 把结果贴回来

把第 4 步的**汇总段**（`LoRA 命中 : x/5` + 5 条命中情况）贴给我，
我判断是「形态对了可以加量」还是「回头改样本」。

---

## 附 · 常见报错

| 报错 | 原因与修法 |
|---|---|
| `FileNotFoundError: '/root/v7_deep_train.yaml'` | ★ 当前目录是 `/root`，没 cd 到 `/root/autodl-tmp`。**用上面的命令块（自带 cd）** |
| `No such file: .../snapshots/master` | 基础模型路径不对 → 第 2 步 |
| `CUDA out of memory` | `v7_deep_train.yaml` 里 `per_device_train_batch_size: 2` → `1`，同时 `gradient_accumulation_steps: 8` → `16` |
| `KeyError: 'auv_v7_deep'` | `dataset_info.json` 没传上去，或传的不是本包的版本 → 第 0 步重传 |
| `check_v7_deep.py` 说 LoRA 不存在 | 训练还没完成，或输出目录名不对 → 检查 `output/qwen25-14b-auv-v7-deep/` |
| 输出里出现书名/术语 | 数据被污染 → 在服务器上重跑 `python build_v7_deep.py` 看自检是否通过 |
