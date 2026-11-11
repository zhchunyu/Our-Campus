# AI 接口交接说明

> 2026-10-05 · 给队友的交付清单 + 接口约定
> 放在 `models/auv/03-推理服务/` —— 这个目录的定义就是"模型封装、API 服务、部署配置"

---

## 0 一句话

**模型不下载、不搬走。长期租的 AutoDL 服务器就是部署环境，我起好服务，队友拿一个公网地址直接调。**

```
我这边（AutoDL 长期租）             队友那边
─────────────────────              ─────────────────
Qwen2.5-14B 基座                   业务后端
   + extract LoRA (V10)   ──HTTP──▶  POST /v1/chat/completions
   + persona LoRA (V7)              model = "extract" | "persona"
   vLLM 双挂载 + 公网端口            包一层 /api/pipeline 给前端
```

队友**不需要**下载权重、**不需要**自己拉基础模型、**不需要**配 GPU。

---

## 1 分工与边界

| 谁 | 干什么 |
|---|---|
| **我** | 在 AutoDL 上起 vLLM、挂两个 LoRA、开公网端口、保证地址可用、复测效果 |
| **队友** | ① 调我给的地址 ② 包一层业务接口（`/api/extract` `/api/respond` `/api/pipeline`）③ 补链路缺口（意图分类 / 系统补全）④ 接权威表 |

★ 队友**唯一需要从我这里拿的** = **公网地址 + API Key + 接口约定**（见 `队友调用说明.md`）。

---

## 2 交接清单

### A 接口（★ 核心交付物）

| 文件 | 说明 |
|---|---|
| **`队友调用说明.md`** | ★ **可以直接转发给队友**：地址、Key、模型名、curl / Python 示例、输出 schema |
| **本文件** | 内部总纲：交接清单 + 三条硬约定 + 链路缺口 |

### B 数据与约定（本地有，按需给）

| 用途 | 文件 | 说明 |
|---|---|---|
| **地点权威表**（★ 后端必用） | `model-finetune/data/campus_locations.json` | 66 地点 / ~167 别名 / 零校名 |
| `地点字段处理约定.md` | — | ★ **后端必须按权威表校验 `building_name`** |
| `AI该训什么_验证结论.md` | — | 为什么地名交给数据库、`severity` 该砍 |
| `V10验收与三路对比_结论.md` | — | 两个 LoRA 的实测能力边界 |
| 训练集 / 评估集 | `data/*.json` | 提取 419+120 · 人设 1597+145 · 深度诊断 206+22 |
| 训练配置 | `v10_extract.yaml` / `v7_train.yaml` | epoch / lr / cutoff 全在里面 |

### C 模型权重 —— ★ **不交接**（留在服务器）

| 权重 | AutoDL 路径 | 状态 |
|---|---|---|
| **提取 LoRA** | `/root/autodl-tmp/output/qwen25-14b-auv-v10-extract` | ✅ 已训（地点合法率 6/6 = 100%） |
| **人设 LoRA** | `/root/autodl-tmp/output/qwen25-14b-auv-v7` | ✅ 已训 |
| 深度诊断增强 | `/root/autodl-tmp/output/qwen25-14b-auv-v7-deep` | ⏸ 待训（口吻未定） |
| 基础模型 | `/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master` | 已在服务器上 |

> **例外**：如果队友想在自己机器上跑一份离线副本（断网演示、二次训练），再按
> `部署清单.md` 的「打包下载」小节操作。**默认不下载。**

### D 部署材料

| 文件 | 说明 |
|---|---|
| `serve_vllm.sh` | vLLM 启动脚本（双 LoRA + api-key + 显存自检） |
| `部署清单.md` | 服务器侧完整步骤：环境 → 起服务 → 开端口 → 复测 → 排错 |

---

## 3 接口约定

### 3.1 部署形态（★ 已实际落地，不是设想）

```bash
vllm serve /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
  --served-model-name qwen25-14b-base \
  --host 0.0.0.0 --port 6006 \
  --api-key <API_KEY> \
  --enable-lora \
  --max-lora-rank 128 \
  --lora-modules extract=/root/autodl-tmp/output/qwen25-14b-auv-v10-extract \
                 persona=/root/autodl-tmp/output/qwen25-14b-auv-v7 \
  --max-model-len 4096
```

> ★ 上面的路径是**实际值**。`model-finetune/README.md` 里写的
> `models/qwen/Qwen2.5-14B-Instruct` 和 `qwen25-14b-event-v1` 是早期版本，**已过时**。
> ★ `--max-lora-rank 128` **不能省**（默认只有 16，会直接报错）。

对外是 **OpenAI 兼容接口**，调用时 `model` 填 `extract` 或 `persona`。

### 3.2 建议再包一层业务接口

队友可以直接调 vLLM，但建议包一层，把**后处理**（权威表校验、字段归一）做进去：

```
POST /api/extract        事件结构化提取
  请求  { "text": "一食堂二楼排队老长了，大概要等20分钟" }
  响应  {
          "type": "congestion",
          "building_id": "canteen",        // ★ 必须经权威表校验后才返回
          "building_name": "谷园餐厅",
          "floor": "2F",
          "severity": "high",
          "description": "...",
          "estimated_wait_min": 20,
          "time_window": "noon",
          "advice": "..."
        }

POST /api/respond        人设化回应
  请求  { "text": "图书馆东边那条路为啥没人走",
          "observations": ["两侧是实墙", "照度 15 lux", "绕行 200 米"] }
  响应  { "reply": "..." }

POST /api/pipeline       完整链路（推荐软件侧只调这一个）
  请求  { "text": "..." }
  响应  { "channel": "emergency" | "event" | "forum",
          "event": {...} | null,
          "reply": "..." }
```

### 3.3 ★★ 三条硬约定（不遵守会出问题）

**① 后端必须以权威表为准，不能直接采信模型输出的 `building_name`**

```
模型输出 building_name（候选）
   ↓
查 campus_locations.json 的 name 或 aliases
   ↓
查得到 → 用表里的真实 id + 坐标落图
查不到 → 丢弃，退回发帖人 GPS / 地图选点
```

原因：模型会**语义联想**（"晕倒" → `校医院`，"宿舍" → `第一学生公寓A区`），
编出来的名字看起来完全合理。V9 时代实测出现过 `知谷`（不存在的楼）。
详见 `地点字段处理约定.md`。

**② 急救类不进提取 LoRA，走快速通道**

判据：**"这条信息不推给附近的人，会不会有人吃亏？"**
- 急救（晕倒/受伤/火情）→ 直接转 120 / 校医院，**不走 JSON**（保命优先，JSON 链路慢 3 秒）
- 互助类（拼车/求借/组队/失物）→ **不进提取**，走论坛
- 一般事件 → 提取 LoRA

★ 实测支撑：**提取 LoRA 不会拒答** —— 喂互助类、纯情绪文本，它照样硬吐一个 JSON。
所以**意图分类必须前置**，这是链路第一环，不是可选项。

**③ `severity` 字段建议不依赖模型**

实测三路（正则 / 基础模型 / 训练后 LoRA）**全部 5/10** —— 三个不同方法同一个分数，
说明是**标注口径问题，不是能力问题**。建议给死规则，或从产品里砍掉。

### 3.4 链路里还缺的两个环节

```
用户输入 → ① 意图分类（毫秒级）  ← ★ 没实现
             ├── 急救类 → 快速通道
             └── 一般事件 → ② 提取 LoRA → JSON
                              → ③ 系统补全  ← ★ 没实现
                              → ④ 推送/落图
```

- **① 意图分类**：可以先用正则/小模型，不必上大模型。判据就是 3.3 的第 ② 条
- **③ 系统补全**：文本没写地点时用发帖人定位/帖子标签补 —— 这是**后端逻辑**，不是模型的事

---

## 4 ★ 安全红线（必须写进交接）

- **`API_KEY` 是唯一门锁。** AutoDL 的「自定义服务」是**公网公开、无额外鉴权**的 ⇒
  不设 key 等于把自己的 GPU 白送给全网。**必须设、必须长、不能写进前端代码。**
- **不把 key 提交进仓库。** 项目约定：AI Key 由使用者在页面弹窗输入 → 存 `localStorage`，
  **绝不写进源码**。仓库/站点里出现 `sk-` 一律视为事故。
- **队友侧的调用 key 放在后端环境变量**，不要下发到浏览器。
- ★ 密钥一旦泄露，**吊销重签只能由账号持有人到服务商后台操作**，队友做不了。

---

## 5 一句话总结给队友

> 你不用下模型、不用配 GPU。**我给你一个地址 + 一个 key**，你按 OpenAI 格式调，
> `model` 填 `extract`（帖子 → JSON）或 `persona`（人设回应）。
> 你包一层业务接口，**地点必须查权威表**，急救类走快速通道，`severity` 别信模型。
> 还缺意图分类和系统补全两个环节，那是后端逻辑。
> 详细调用示例见 `队友调用说明.md`。
