# 先看这个 —— AUV 推理服务接口

## 你要的两样东西

| 项 | 值 |
|---|---|
| **服务地址** | `https://u1199722-6hqt-2f39f661.weste.seetacloud.com:8443` |
| **API Key** | **我单独发你**（不在这个包里，请勿转发、勿提交进仓库） |

> ★ 地址以我最新发给你的为准（服务器重启后可能变化）。

---

## 最短上手（30 秒）

```bash
export AUV_BASE_URL="https://u1199722-6hqt-2f39f661.weste.seetacloud.com:8443"
export AUV_API_KEY="我单独发你的那串"

curl -s "$AUV_BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUV_API_KEY" \
  -d '{
    "model": "extract",
    "temperature": 0,
    "messages": [
      {"role": "system", "content": "你是校园事件分析助手。请从用户描述中提取事件的结构化信息，输出JSON格式，包含以下字段：type(事件类型，取值safety/congestion/service/notice)、building_id(建筑ID，与building_name同步，没有则为null)、building_name(建筑名称，描述中未提及地点时填null)、floor(楼层，没有则为null)、severity(严重程度，取值low/medium/high)、description(事件摘要)、estimated_wait_min(预计等待或持续时间，单位分钟，没有则为null)、time_window(时间段，取值morning/noon/afternoon/evening/night/unknown)、advice(行动建议)。注意：描述中没有明确提到的地点、楼层等信息一律填null，不要推测或编造。"},
      {"role": "user", "content": "谷园餐厅现在人多到爆，队都排到门口了"}
    ]
  }'
```

**期望返回**：`type=congestion`、`building_name=谷园餐厅`。

> ★ 想先自己试一把？浏览器打开 **`<服务地址>/docs`** → 点 **Authorize** 填 Key →
> 展开 `POST /v1/chat/completions` → **Try it out**。
> ★ 直接打开服务地址（不带 `/docs`）会看到 `{"detail":"Not Found"}` —— **这是正常的**，服务没有首页。

---

## 包内文件怎么用

| 文件 | 什么时候看 |
|---|---|
| **`队友调用说明.md`** | ★ **主文档**。instruction 原文、Python 示例、9 字段值域表、四条约定、常见报错 |
| **`check_served_api.py`** | 想快速验证接口通不通：`python check_served_api.py`（会打 8 条用例、算地点合法率） |
| **`实时数据怎么进到AI里.md`** | ★ **定架构之前看** —— 实时数据怎么进模型、后端怎么查库拼 prompt |
| `地点字段处理约定.md` | ★ **接后端之前必看** —— 地点必须查权威表，不能直接信模型 |
| `campus_locations.json` | ★ **地点权威表**（66 地点 / ~167 别名）—— 后端要加载它做校验 |
| `V10验收与三路对比_结论.md` | 想知道模型哪儿强哪儿弱（哪里别指望它） |

---

## 两个模型

| 模型名 | 用途 | 输入 → 输出 |
|---|---|---|
| **`extract`** | 帖子 → 结构化事件 | 学生原话 → **9 字段 JSON** |
| **`persona`** | 人设化回应 | 事件信息 / 空间观察 → 自然语言 |

★ 协议是 **OpenAI 兼容**，用 `openai` SDK 或 `requests` 都能调。

---

## 三条必须遵守的约定（摘要）

1. **地点不能直接信模型** —— 它会「语义联想」编楼名（"晕倒"→`校医院`）。
   必须查 `campus_locations.json` 校验，查不到就丢弃、退回发帖人 GPS。
2. **急救类不走模型** —— 晕倒 / 受伤 / 火情直接转 120 / 校医院。
   ★ 实测：`extract` **不会拒答**，喂互助帖也硬吐 JSON ⇒ **意图分类必须前置**。
3. **`severity` 别信模型** —— 实测三路全 5/10，是标注口径问题，建议给死规则或砍掉。

---

## 服务可用性

- 服务器长期租着，但**平时可能处于无卡模式**（省钱）⇒ 那时接口不通
- **要联调请提前说**，我切成有卡模式把服务起起来
