# Trae 版实现 · 实机评测与改进建议

> 评测对象：`02-三维资产/site/preview.html` + `site/src/{preview.js, navigation.campus.js, events.js}`（Trae 生成的工作副本）
> 评测方式：本机 Chromium（Playwright 驱动，`--disable-gpu --enable-unsafe-swiftshader`）真实加载 `http://127.0.0.1:8124/preview.html`，走查全部交互路径并截图
> 评测时间：2026-09-26　|　证据截图：`05-测试与质量/评审证据_Trae版/`

---

## 0 结论速览

**这版实现的方向是对的，工程量也不小 —— 但它现在演示不了。**

三处阻断、五处让「AI 在做判断」这件事看不出来、一处让整份成果随时归零。前 8 项修完，作品就能从「能跑」变成「能拿分」。

**实测硬数据**

| 项 | 实测值 | 评价 |
|---|---|---|
| 首屏加载到可交互 | **4.7 s** | 好 |
| 模型规模 | 1,535,187 面 / 392 对象 / 54 材质 | 与 S5 优化目标一致 |
| 每帧提交 | 412 draw call / 1,537,239 面 | 与 S5 实测 405 call 吻合，事件系统只增加约 7 call |
| 自适应分辨率 | dpr 1.5 → **0.75**（软渲染 0.7 fps 触发下限） | 机制生效，但下限偏低 |
| 上报链路 | **走不通**（地点永远为空 → 提交永久禁用） | ❌ 阻断 |
| 导航「开始导航」 | **点不到**（被补全下拉盖住） | ❌ 阻断 |
| 主校门 → 食堂 | 315 m / 4 min（修前 844 m） | ✅ 已修好 |
| 宿舍E → 食堂 | 63 m（修前 554 m / 9 段） | ✅ 已修好 |
| 封路绕行（诊断工具） | 278 → 878 m（+216%） | ✅ 已生效 |
| 13 条演示事件的可信度 | **10 条 = 55%**，1 条 53%，1 条 65%，1 条 85% | ❌ 算法退化成常数 |
| 演示事件流 | 12 条封顶，约 **1 分 45 秒后停止** | ❌ 演示中段会「死」 |
| 路线文字指引 | 4 条路线全部为**空字符串** | ❌ 功能缺失 |

**优先处理顺序（按投入产出比）**

| # | 改进项 | 级别 | 改什么 | 为什么值 |
|---|---|---|---|---|
| 1 | 上报弹窗遮挡画布，地图选点不可用 | **P0** | `#report-modal` 选点期间让位（约 15 行） | 不修则「UGC 上报」这条主线完全无法演示，功能完整性直接落进 0–6 分档 |
| 2 | 全部改动只存在于 `site/`（构建产物） | **P0** | 回灌 `web-demo/` + `SRC_FILES` 加 `events.js` | 不修则跑一次 `make_site.py` 全部清零 |
| 3 | 补全下拉盖住「开始导航」 | **P0** | 限制下拉高度 / 选完即收 | 导航是第二个主功能，现在点不动 |
| 4 | 可信度恒为 55%，UGC 永不过阈值 | **P1** | 重做 Mock 数据分布 | 让「AI 在分层」这件事被看见 —— 技术实现分档的关键 |
| 5 | 演示数据「文本 ↔ 地点」不对应 | **P1** | 模板绑定地点候选 | 答辩现场最容易被一眼看穿的硬伤 |
| 6 | 时空去重在演示中从不触发 | **P1** | 造 3–5 条同簇上报 | 去重是 P0 算法，看不见等于没做 |
| 7 | 安全类事件永远不打点 | **P1** | 改 `shouldHideMarker` 逻辑 | 越紧急越不显示，逻辑倒挂 |
| 8 | 只读模式相机 12 s 完全静止 | **P1** | 加自动导览 | 评审打开公网链接看到的是「一张静止的图」 |
| 9 | 路线文字指引为空 | **P1** | 未配 Key 时给本地模板文案 | 3 行代码，导航立刻像个产品 |
| 10 | 审核徽标恒为 0 + 证据链看不见 | **P1** | 徽标随事件更新 + 详情置顶 | 人在回路是核心亮点，现在藏在两层点击之后 |

---

## 1 实测记录

### 1.1 加载与渲染

首屏 4.7 s 就绪（`window.__preview().ready === true`）。控制台**零报错、零 404、零 shader 警告**。

```
{"tri":1535187,"mesh":392,"mat":54,"calls":412,"drawn":1537239,
 "ready":true,"failed":false,"proto":"http:","tier":"balanced","dpr":0.75,"shadow":true}
```

`?quality=balanced` 下自适应分辨率把 dpr 从 1.5 降到下限 0.75 —— 这是软渲染（约 0.7–1.1 fps）触发的预期行为，真机 GPU 不会。但**下限 0.75 偏低**：评审若用集显笔记本开公网链接，第一眼看到的就是糊的。

### 1.2 走查的交互路径

| 路径 | 结果 |
|---|---|
| 加载 → 首屏 | ✅ 正常，见 `E1_首屏_交互模式.png` |
| 事件面板自动生成 | ✅ 3 条初始 + 后续自动追加 |
| 打开上报弹窗 → 选类型 | ✅ 正常，见 `E2_上报弹窗_选点失败.png` |
| 弹窗内「地图选点」→ 点地图 | ❌ **完全无响应**（详见 §2.1） |
| 填文本 → 提交 | ❌ 按钮永久 `disabled` |
| 审核工作台 | ✅ 列表 / 统计 / 证据链齐全，见 `E3_审核工作台.png` |
| 导航（主校门→食堂） | ⚠️ 能算出路，但按钮点不到（详见 §2.3）；路线渲染漂亮，见 `E4_导航路线_主校门到食堂.png` |
| 自然语言导航 | ✅ 未配 Key 时弹窗提示清楚，指向「⚙ AI 设置」 |
| 只读模式 | ⚠️ 上报入口正确隐藏，但相机静止，见 `E5_只读模式_公网形态.png` |
| 点击事件列表 → 相机飞行 | ⚠️ 会动，但软渲染下 8 s 才走完 80%（详见 §4.2） |

### 1.3 值得肯定的地方

- **`events.js` 是真管线**，不是假动画：`extractSchema`（8 字段结构化抽取）→ `spatiotemporalDedupe`（150 m / 45 min 双阈值）→ `computeCredibility`（五路可分解加权）。`breakdown` 能打印每一项的贡献，评审问「为什么是 55%」时能当场答。
- **审核证据链做得对**：实测输出 `基础分 +40% / 来源权重 +5% / 群体佐证(1人独立上报) +0% / 常识校验 +5% / 文本质量 +5% / 综合可信度 55% / 阈值 65%`。这是全页最有说服力的一块。
- **`_diag_road_nav.py` 是本次最有价值的附加产出**：6 项诊断（数据完整性 / 连通性 / 入口朝向 / 穿楼 / 关键路径 / 封路绕行），纯 Python 秒级出结果，把「路网好不好」从主观判断变成了可回归的判据。
- **我此前记录的三处缺陷已被修掉**：① 生活区北排 4 栋入口朝向 `north → south`；② 锚点表改为从 `BUILDINGS` 派生（锚点偏差从 8/19 超 60 m 收敛到 4 例，且这 4 例是站台/谷地等非建筑，属误报）；③ 补边 `axis_gate ↔ outer_s2` 后，主校门→食堂 844 m → **315 m**，封路绕行从「无效」变成 **+216%**。
- **密钥安全**：`site/` 与 `web-demo/` 全目录 `grep 'sk-[A-Za-z0-9]'` **零命中**；`AI_CONFIG.apiKey` 走 `localStorage`。

---

## 2 阻断级缺陷（P0）

### 2.1 上报链路走不通：弹窗把画布整个盖住

**实测证据**

```
ELEMENT_FROM_POINT（上报弹窗开着时，取画布上 6 个点）
  400,250   → report-modal     isCanvas: false
  200,700   → report-modal     isCanvas: false
  800,250   → H2               isCanvas: false
  1200,700  → report-modal     isCanvas: false
  800,620   → report-btns      isCanvas: false
  760,780   → report-modal     isCanvas: false

REAL_CLICK(400,250):  {"place":"","picking":true,"modal":true}   ← 点了没反应
REAL_CLICK(200,700):  {"place":"","picking":true,"modal":true}
REAL_CLICK(1200,700): {"place":"","picking":true,"modal":true}
```

**画布上没有任何一点能收到点击。** 三次真实点击后，`#report-place` 仍为空、选点模式仍在、`#report-submit` 永久 `disabled`。

**根因**

```css
#report-modal{position:fixed;inset:0; ... z-index:40}   /* 全屏遮罩 */
.report-pick-hint{ ... z-index:35}                      /* 选点提示被压在下面，用户根本看不到 */
```

点「地图选点」只做了三件事：置 `pickMode = true`、显示 `#pick-hint`（z-index 35，被遮）、把光标改成十字。**弹窗不关**，`inset:0` 的遮罩继续吃掉所有指针事件，`onCanvasClick` 永不触发。

**逻辑本身是对的** —— 把合成事件直接派发到 canvas，立刻命中：

```
SYNTHETIC_CLICK_ON_CANVAS: {"wasPicking":true,"place":"创新中心","picking":false,"submitDisabled":true}
SUBMIT_ENABLED: true        ← 地点一填上，提交按钮立刻可用
AFTER_SUBMIT: 事件成功入列
```

**修法（约 15 行）**

```js
let pickingFromModal = false;

function enterPickMode() {
  pickMode = true;
  pickingFromModal = !document.getElementById('report-modal').classList.contains('hidden');
  if (pickingFromModal) document.getElementById('report-modal').classList.add('hidden');  // ★ 让位
  document.getElementById('pick-hint').classList.remove('hidden');
  ...
}

function exitPickMode() {
  pickMode = false;
  document.getElementById('pick-hint').classList.add('hidden');
  if (pickingFromModal) {                                  // ★ 选完/取消后回填
    document.getElementById('report-modal').classList.remove('hidden');
    pickingFromModal = false;
  }
  ...
}
```

同时把 `.report-pick-hint` 的 `z-index` 提到 50，并在提示条上加一个「取消选点」按钮 —— 现在用户进了选点态就没有退路。

**价值**：直接决定「学生上报 → AI 判定 → 地图打点 → 他人可见」这条主线能不能演。**这是作品的核心叙事**，也是评分表里「功能完整性（20 分）」的判据 —— 核心 AI 功能缺失落在 0–6 分档。

---

### 2.2 全部改动只存在于构建产物，跑一次构建就归零

**实测证据**

```
web-demo/preview.html      event-panel=0  nav-panel=1  mod-panel=0  report-modal=0
                           panel-tabs=0   mod-badge=0  pick-hint=0  mode-badge=0
site/preview.html          event-panel=1  nav-panel=1  mod-panel=1  report-modal=1
                           panel-tabs=1   mod-badge=1  pick-hint=1  mode-badge=1

web-demo/src/preview.js    含 initEvents / createMarker / runAIPipeline / setMode：0 处
site/src/preview.js        含以上关键字：7 处
```

**Trae 的全部新功能（事件面板、上报弹窗、审核工作台、模式开关、地图选点）在源码目录 `web-demo/` 里一个字都没有。** 只有 `site/` 有。

而 `site/` 是 `tools/make_site.py` 的**产物**，构建方向是 `web-demo/ → site/`。下一次构建会发生四件事：

| 步骤 | 后果 |
|---|---|
| `shutil.copy2(WEB/preview.html, SITE/preview.html)` | 用 15,836 B 旧版覆盖 29,680 B 新版 → **整套 UI 消失** |
| `shutil.copy2(WEB/src/preview.js, SITE/src/preview.js)` | 用不含事件系统的旧版覆盖 → **事件/AI 管线全丢** |
| `SRC_FILES = ('preview.js','navigation.campus.js')` 的孤儿清理 | `site/src/events.js` **被当孤儿删除** |
| `shutil.copy2(WEB/src/navigation.campus.js, ...)` | 用旧版覆盖 → **别名表、补边、入口朝向修复全丢** |

**修法（两步，都要做）**

1. **回灌**：把 `site/` 的四个文件覆盖回 `web-demo/`
   ```
   site/preview.html                 → web-demo/preview.html
   site/src/preview.js               → web-demo/src/preview.js
   site/src/navigation.campus.js     → web-demo/src/navigation.campus.js
   site/src/events.js                → web-demo/src/events.js
   ```
2. **改白名单**：`tools/make_site.py` 第 284 行
   ```python
   SRC_FILES = ('preview.js', 'navigation.campus.js', 'events.js')   # ★ 加 events.js
   ```
   并把文件头注释里的清单同步补上。

**价值**：不修的话，后面所有工作都建在流沙上 —— 任何一次「重新构建站点」都会让当天成果无声消失，而且**不会报错**（脚本还会打印「✓ 3D 预览：preview.html + src/…」）。这是本项目历史上已经踩过一次的坑（旧 `navigation.js` 手工放进 `site/` 导致新旧混搭）。

---

### 2.3 补全下拉盖住「开始导航」

**实测证据**

```
SUGGEST_BLOCKS_GO_BTN: {
  "buttonCenter": [1422, 337],
  "topElementAtButton": "nav-to-suggest",      ← 按钮位置上的最上层元素是补全列表
  "suggestHidden": false,
  "suggestText": "食堂 (别名匹配)"
}
PLAYWRIGHT_CLICK_NAV_GO_OK: false              ← 真实点击点不到
```

在 `#nav-to` 里填完终点后，`#nav-to-suggest` 一直开着并覆盖在 `#nav-go` 上。用户必须先在别处点一下（或按 Esc）才能点到「开始导航」—— 第一次用的人会认为按钮坏了。

**修法**（任一即可，建议都做）

- 给 `.suggest-list` 加 `max-height: 180px; overflow-y: auto`，并让它**向上弹**（`bottom: 100%`）而不是向下压住按钮；
- 输入框 `blur` 后 200 ms 自动收起；
- 补全项被点击 / 回车命中后立刻收起（目前回车只在 `activeIndex >= 0` 时生效，直接敲回车什么都不发生）。

**价值**：导航是并列于「事件」的第二个主功能，也是「技术实现（20 分）」里「软件交互流畅」的直接判据。

---

## 3 让 AI 被看见：核心痛点与算法可见性（P1）

> 这一节回答「哪些环节最能帮助解决用户的核心痛点」。核心痛点不是「能不能上报」，而是**「一堆互相矛盾的学生上报，怎么变成一条可信的路况」**。当前实现有完整的算法骨架，但**在演示里看不出它在工作**。

### 3.1 可信度退化成常数：13 条里 11 条挤在 53–55%

**实测（审核工作台 13 条，按可信度降序）**

```
85%  ◆ 校园通知 | 图书馆国庆期间开馆时间调整…            | 📍 体育馆      ← 官方源
65%  ⚠ 安全预警 | 实验楼后面的路灯坏了两盏…              | 📍 主校门路口
55%  ⇄ 通行拥堵 | 三食堂门口排队排到马路上了…            | 📍 创新中心
55%  ⇄ 通行拥堵 | 图书馆西侧路口两车剐蹭…                | 📍 智谷谷底
55%  ✚ 互助求助 | 求组队参加下周的算法比赛…              | 📍 S7站
55%  ◆ 校园通知 | 校医院本周开展免费体检…                | 📍 教学D楼
53%  ☕ 生活服务 | 快递驿站积压件清完了…                  | 📍 智谷谷底
      …（其余 5 条同为 55%）
```

分布：**55% × 10、53% × 1、65% × 1、85% × 1**。

**为什么全是 55%**：`randomEvent()` 生成的每条上报，五个分项都是固定值 ——

| 分项 | 值 | 原因 |
|---|---|---|
| `base` | +40% | 常数 |
| `source` | +5% | 全走 `manual_pick`（`randomEvent` 不传 `position_source`） |
| `crowd` | +0% | 永远是 `count = 1`（没有同簇邻居） |
| `commonSense` | +5% | `nearestAnchor` 只要列表非空就必返回，永不落空 |
| `text` | +5% | 模板几乎都 > 20 字（唯一 17 字那条 `快递驿站积压件清完了，取件不用等` 得 +3%，这就是 53% 的来源） |
| **合计** | **53–55%** | 阈值 65% ⇒ **UGC 永远不通过** |

⇒ 演示结果是「**12 条待核实 / 1 条已发布**」，已发布的那条还是官方源（+35%）。评审看到的是：**AI 把所有用户上报都判为不可信，产品像坏的。**

**修法：把 Mock 数据从「随机」改成「有分布的剧本」**

```js
// events.js —— 给模板配可信度画像，而不是随机抽
const SCENARIOS = [
  // ① 单条弱证据：短文本 + 无锚点 → 50% 以下，卡在待核实
  { type:'help',    text:'捡到一张卡',            anchor:null,        reporters:1 },
  // ② 单条中等证据：正常文本 → 55%，卡在阈值下
  { type:'service', text:'图书馆三楼自习区空位挺多', anchor:'中心图书馆', reporters:1 },
  // ③ 三人同簇：同一地点 8 分钟内 3 条 → crowd +18% → 73%，自动发布
  { type:'traffic', text:'三食堂门口排队排到马路上了', anchor:'食堂', reporters:3 },
  // ④ 五人同簇 + 官方源确认 → 40+35+25+5+5 = 100% → 高亮发布
  { type:'safety',  text:'湖边护栏松动',            anchor:'滨水挑台', reporters:5, official:true },
];
```

这样审核列表会出现 **50% / 55% / 73% / 100%** 的梯度，可信度条不再是装饰。

**价值**：这是「技术实现（20 分）」从 7–13 档推到 14–20 档的关键 —— 评分细则原文是「**AI 算法设计科学，模型选型合理**」。一个所有输入都得同一个分的评分函数，看不出设计；一个有分层的评分函数，一眼就是设计过的。

---

### 3.2 时空去重在演示中从不触发

`spatiotemporalDedupe` 的三路阈值（空间 150 m / 时间 45 min / 同类型）实现正确，但 `randomEvent` 在**全园 19 个锚点里均匀随机**取点 —— 相邻两条上报的间距动辄 300–600 m，**永远进不了 150 m 窗口**。

实测 13 条里出现了两条文案完全相同的事件（`三食堂门口排队排到马路上了…`），一条在 📍创新中心、一条在 📍案山南坡，相距 534 m，**正确地没有被合并** —— 算法没错，但演示里「去重」这个动作一次都没发生过。

**修法**：让 Mock 生成器按「簇」投放 —— 每 3–5 条为一簇，同锚点 ±30 m 抖动、时间戳相差 2–10 min。这样审核列表里会出现「群体佐证 (3 人独立上报) +18%」，地图上 3 个标记收成一个并显示「3 人上报」。

**价值**：去重是本项目 P0 级算法（也是「创新性 20 分」的支撑点）。**看不见的算法等于没做** —— 答辩时只能口头说，没有画面对应。

---

### 3.3 演示数据的「文本 ↔ 地点」不对应

实测 13 条里 **7 条以上明显矛盾**：

| 事件文本 | 实际打点位置 | 矛盾 |
|---|---|---|
| 图书馆西侧路口两车剐蹭 | 智谷谷底 | ❌ 图书馆西侧 ≠ 智谷 |
| 实验楼后面的路灯坏了两盏 | 主校门路口 | ❌ |
| 校医院本周开展免费体检 | 教学D楼 | ❌ |
| 快递驿站积压件清完了 | 智谷谷底 | ❌ 谷底没有驿站 |
| 第一食堂二楼的麻辣香锅今天开窗口 | 创新中心 | ❌ |
| 有人在教学楼B 302 看到我的黑色雨伞 | 主校门 | ❌ |
| 图书馆国庆期间开馆时间调整 | 体育馆 | ❌ |

根因在 `randomEvent()`：

```js
const a = anchors[Math.floor(Math.random() * anchors.length)];   // 与 text 完全无关
```

**修法**：把 `TEMPLATES` 从「字符串数组」升级为「字符串 + 地点候选」：

```js
traffic: [
  { t:'三食堂门口排队排到马路上了，队伍占了一半车道', at:['食堂','商业街'] },
  { t:'图书馆西侧路口两车剐蹭，暂时只能单边通行',     at:['中心图书馆','环廊S4站'] },
  ...
]
```

**价值**：这是**答辩现场最容易被一眼看穿**的硬伤。评委不需要读代码，只要把列表和地图对一遍就发现了。它直接伤「AI 融合深度」和「技术实现」两项。

---

### 3.4 安全类事件永远不打点：越紧急越不显示

```js
function shouldHideMarker(ev) {
  if (ev.type !== 'safety') return false;
  const score = ev.ai?.credibility?.score ?? 0;
  return !ev.ai?.credibility?.passed && score < 0.75;
}
```

配合 §3.1 的常数问题：安全类阈值 0.75，而所有 UGC 恒定 55% ⇒ **`shouldHideMarker` 对安全类恒为 `true`**。

于是「路灯坏了、护栏松动、地砖翘起」这些**最该被看见**的事件，**地图上一个标记都没有**；列表里点一下，相机会飞过去停在一片空地上（`selectEvent` 不检查标记是否存在）。

设计意图（「待核实的安全类不打点，防误报」）是对的，但结果是**安全类永远不打点**，逻辑倒挂。

**修法**（三选一，建议 ②）

1. 待核实 → 打**半透明灰色标记**（区别于已发布的彩色），状态可见但不误导；
2. **打标记 + 在标签上加「待核实」前缀**，同时把地图上的待核实事件与列表项做视觉联动；
3. 只对「已驳回」的事件不打点。

另：`selectEvent` 应加一句 —— 若目标事件没有标记，在结果区提示「该事件待核实，暂未上图」，而不是把相机送到空地。

**价值**：这是「应用价值（15 分）」里「有效解决行业实际痛点」的落点 —— 校园安全预警是本产品最有社会价值的场景，现在它是隐形的。

---

### 3.5 审核徽标恒为 0，AI 判定分解藏在面板底部

**实测**

```
打开页面 10 s 后：  #mod-badge = "0"
切到审核 tab 之后： #mod-badge = "12"，pending=12 / published=1
```

`#mod-badge` 在 HTML 里写死 `0`，只有 `renderModerationList()` 被调用时才更新，而它**只在切到审核 tab 时**才跑。于是「有待办」这件事在最需要提示的时候提示不出来。

而**证据链详情**（全页最有说服力的「AI 可解释」模块）渲染在列表**最下方**，点条目后 `display:block` 但**不滚动、不置顶** —— 实测截图 `E3_审核工作台.png` 里，点完之后画面上什么都没变（详情在可视区之外）。

**修法**

1. 把 `renderModerationList()` 里的统计段拆成独立的 `updateModBadge()`，在 `addEvent()` 的 AI 回调里也调一次；
2. 详情改为**置顶**（插到列表上方）或**覆盖列表**，并在点击后 `scrollIntoView({behavior:'smooth'})`；
3. 徽标在有待办时加脉冲动效 —— 这是「人在回路」的唯一入口提示。

**价值**：`breakdown` 的五路分解（基础分 / 来源权重 / 群体佐证 / 常识校验 / 文本质量）是整个作品**最能证明「AI 真的在算」**的东西。现在它需要「打开审核 tab → 点条目 → 向下滚动」三步才能看到 —— 等于没做。

---

### 3.6 事件与路网未联动：封路能力只有诊断工具，没有产品入口

```js
function buildGraph() { ... }        // 无参数
const GRAPH = buildGraph();          // 模块加载时静态建一次，之后再不变
```

`computeRoute()` → `computeRoadRoute()` → 用这个静态 `GRAPH`。**没有任何地方根据事件屏蔽路段**，也没有任何 UI 能触发封路。

而 `_diag_road_nav.py` 里的封路绕行测试跑得很好：

```
封路：outer_s2 ↔ outer_s3
  · 主校门 → 食堂: 278 → 878 m (+600 m, +216%) — 绕行可见 ✓
```

**这是全作品最有戏剧性的一个演示瞬间**：上报「餐厅门口有卡车挡路」→ 路网屏蔽该段 → 重算路径 → 距离从 315 m 跳到 878 m，地图上路线当场改道。

**修法**

```js
// navigation.campus.js
export function buildGraph(blockedSet = new Set()) { ... }   // 支持屏蔽
let GRAPH = buildGraph();
export function applyBlockedEdges(edges) { GRAPH = buildGraph(new Set(edges)); }

// preview.js —— 事件进入 published 后，把事件位置附近的路段加入屏蔽集
function syncBlockedRoads() {
  const blocked = [];
  events.filter(e => e.status === 'published' && e.type === 'traffic')
        .forEach(e => blocked.push(...nearbyEdges(e.x, e.z, 60)));   // 60 m 内的路段
  applyBlockedEdges(blocked);
}
```

并在导航结果卡里显示「⚠ 途经 1 处封路，已自动绕行 +120 m」。

**价值**：这是把「事件系统」和「导航系统」两个独立模块**缝成一个产品**的那一针。现在它们是两个并列的 demo，缝上之后就是「AI 闭环」—— 对应「创新性（20 分）」的「形成独特解决方案」档位。

---

### 3.7 路线文字指引是空的（4 条路线全部）

**实测**

```
NAV_GATE_CANTEEN: {"from":"主校门","to":"食堂","dist":"315 米","time":"约 4 分钟","desc":""}
NAV_DORME_CANTEEN:{"dist":"63 米",   "desc":""}
NAV_GATE_LIB:     {"dist":"494 米",  "desc":""}
NAV_INNO_LAB:     {"dist":"642 米",  "desc":""}
```

`desc` 全是**空字符串**，结果卡里「距离 / 步行时间」下面是一片空白（见 `E4_导航路线_主校门到食堂.png`）。

**根因**：`generateRouteDescription()` 在未配置 AI 时 `return null`，而调用方直接把返回值赋给了 `textContent`：

```js
// navigation.campus.js:1159
export async function generateRouteDescription(route) {
  if (!AI_CONFIG.enabled) return null;      // ← 返回 null，不是抛错
  ...
}

// preview.js
const desc = await generateRouteDescription(route);
el.rDesc.textContent = desc;                // null → textContent = ""（空白）
```

`catch` 分支里其实写了一句很好的兜底（`'步行约 X 分钟，沿道路前行即可到达。'`），但**永远执行不到** —— 因为函数不抛错。

**修法（推荐做本地模板化指引，而不是只补兜底）**

```js
// navigation.campus.js —— 未配 AI 时给规则化指引，本身就是产品能力
export async function generateRouteDescription(route) {
  const { from, to, distance, points } = route;
  const minutes = Math.ceil(distance / 70);

  if (!AI_CONFIG.enabled) {
    const via = landmarksAlong(points);          // 取路径附近的地标名
    return `从${from.name}出发，${via.length ? '途经' + via.join('、') + '，' : ''}`
         + `步行约 ${distance.toFixed(0)} 米（${minutes} 分钟）即可到达${to.name}。`;
  }
  ...
}
```

**价值**：3–10 行代码，导航立刻从「一个数字」变成「一段向导话术」。对应「技术实现」里「软件交互流畅」与「功能完整性」里「操作流程流畅」。

---

## 4 使用体验：影响观感的具体问题（P1 / P2）

### 4.1 演示事件流约 1 分 45 秒后停止

```js
function next() {
  setTimeout(() => {
    if (events.length < 12) { addEvent(randomEvent(anchors)); }   // ★ 硬上限 12
    next();
  }, 8000 + Math.random() * 7000);
}
```

3 条初始 + 9 条增量 = 12 条封顶，约 **105 秒**后事件流彻底静止。评审看视频到第 2 分钟，画面上的事件就不再更新了 —— 会以为是静态假数据。

**修法**：改成滚动窗口 —— `if (events.length >= 24) events.pop()`（保留最新 24 条），或直接去掉上限。

**价值**：低成本，直接决定「这是个活的系统还是个截图」。

### 4.2 事件列表全量重建：滚动复位、点击落空

`renderEventList()` 每次都用 `list.innerHTML = events.map(...)` 整体重建。实测在有新事件到达的瞬间点击列表项，Playwright 报：

```
- element was detached from the DOM, retrying
```

用户侧的体感是：**正在看的条目被抽走、滚动位置跳回顶部、选中高亮消失**。

**修法**：改为增量 DOM 操作（新条目 `prepend`，状态变化只改对应节点的 class），或至少保留 `scrollTop`：

```js
const keep = list.scrollTop;
list.innerHTML = ...;
list.scrollTop = keep;
```

### 4.3 低帧率下相机动画被拉长 8 倍

**实测（软渲染，1.1 fps）**

```
CAM_SEQ（点击事件后每 1 s 采样）
  t=0  [0, 1080, 520]
  t=4s [45.9, 768.2, 310.6]
  t=8s [115.7, 294.3, -7.7]      ← 8 s 才走完约 80%
```

**根因**：动画的时间步复用了**被 clamp 的渲染 dt**

```js
const dt = Math.min(now - last, 100);      // 物理正确：防止大步长穿透
...
navTween.t = Math.min(1, navTween.t + dt / 1200);
```

`dt` 被限制在 100 ms，帧率低时每帧只推进 `100/1200 = 8.3%`，于是标称 1.2 s 的动画在 1 fps 下要走 **12 s**。

**修法**：动画用真实墙钟时间

```js
navTween.t0ms = performance.now();
// tick 内：
navTween.t = Math.min(1, (now - navTween.t0ms) / 1200);
```

**价值**：真机 GPU 上不明显，但**评审可能用集显笔记本或手机打开公网链接** —— 那时「点了没反应、几秒后才动」就是第一印象。顺带修掉自适应分辨率下限（`DPR_FLOOR` 0.75 → 0.9）和默认 `quality`（公网链接建议默认 `perf`）。

### 4.4 只读模式：公网链接是一张静止的图

```
READONLY: {"badge":"READONLY · 只读模式","reportHidden":true,"modTabDisplay":"none","evItems":5}
READONLY_CAMERA_STATIC: {"a":[0,1080,520],"b":[0,1080,520],"moved":false}   ← 12 s 完全不动
```

`setMode('readonly')` 只做两件事：隐藏上报按钮、隐藏审核 tab。**相机不巡航、无导览、无旁白**（见 `E5_只读模式_公网形态.png`）。

赛制「作品基本要求」第 4 条明确写：**「可提供在线演示地址…方便评审验证」**。评审点开链接看到的是一个静止鸟瞰图 + 一列滚动事件 —— 三维资产这个最大亮点完全没有主动展示。

**修法**：readonly 时启动自动导览 —— 沿 7 个预设机位轮播（每个停留 12–15 s，带缓动与文字标注「① 中轴·垂直书院」），右下角给「▶ 自动导览 / ⏸」。`controls.autoRotate` 已有基础设施。

**价值**：评审打开链接的第一眼就能看懂「这是一座设计过的校园」，而不是自己摸索。同时兜住「演示视频没播到」的风险。

### 4.5 预设机位按钮被隐藏，但入口页仍在宣传

```css
#head,#presets,#hint{display:none!important}
```

7 个机位按钮被 CSS 隐藏（实测 `presetsDisplay: "none"`）。键盘 <kbd>1</kbd>–<kbd>7</kbd> 仍可用，但**没有任何可见入口**。

而 `make_site.py` 生成的入口页卡片仍写着：「含 7 个机位预设…拖拽旋转、滚轮缩放、按 <kbd>1</kbd>–<kbd>7</kbd> 切机位」。**宣传了一个看不见的功能。**

**修法**：把预设收进导航面板底部的折叠区（「📷 机位」），或恢复底部条；同步校正入口页文案。

**价值**：7 个机位是三维资产的主要展示手段，藏起来等于浪费。而且「文案与实现不一致」在评审眼里是减分项。

### 4.6 调试 HUD 被导航面板完全遮住

```
#stats     rect [1432, 18, 150, 111]
#nav-panel rect [1262, 18, 320, 354]      ← 完全覆盖 stats
```

两者都是 `right:18px; top:18px`。截图确认 FPS / DrawCall 读数**一个字都看不见**。

**修法**：挪到左下与模式标签同行，或直接隐藏。

**价值**：这是个两难 —— 留着能体现「153 万面实时渲染」的技术实力，但必须**可见**才有意义。建议移到左下，并改成更克制的样式。

### 4.7 缺少首次进入引导与模式说明

首屏有 3 个面板 + 上报按钮 + 模式标签，第一次来的人不知道先点哪。`READONLY · 只读模式` / `INTERACTIVE · 交互模式` 只给了名字，没说**只读模式下能做什么、不能做什么**。

**修法**：加 3 步浮层（① 左侧看实时事件 ② 右上试试 AI 导航 ③ 右下上报一条），只在首次访问显示；模式标签 hover 出说明「只读模式：可浏览全部事件与导航，不可上报」。

**价值**：评审验证时的第一分钟决定印象分。低成本。

---

## 5 竞赛评审与评分维度映射

评分规则原文（`00-赛事与规范/附件1_场景创新赛道赛题及竞赛规则.txt` 第七节「场景创新赛道评分表」）：

> ⚠️ **2026-10-11 口径迁移**：本节原先引用的是 `AI软件创新赛道详细信息表.docx`（**旧赛道，
> 已弃用**）。赛道已切换为**场景创新赛道**，评分项与分值**完全不同**（旧：创新性 20 / 技术实现 20 /
> 功能完整性 20 / 方案完整性 20 / 应用价值 15 / 总结展望 5）。下表已按新赛道重排，
> 原有结论与待办原样保留，仅重新归位到对应的新评分项下。

| 评分项（场景创新赛道） | 分值 | 细则要点 | 当前实现的实际处境 | 该做什么 |
|---|---|---|---|---|
| **创新性** | 25 | 「提出全新的智能体应用模式或解决方案，具有开创性」得 18–25；「在现有基础上显著改进，形成独特方案」得 9–17 | 架构有想法（事件众包 + 时空去重 + 可分解可信度 + 人在回路），但**演示里只看到 55% 一个数**，且去重从不触发 | 做 §3.1 + §3.2 + §3.6：让分层与去重**可见**，把事件与路网缝成闭环 |
| **需求分析** | 15 | 「问题剖析深入全面，需求调研方法科学，需求把握准确」得 10–15 | 场景明确（校园安全 / 通行 / 服务），但**安全类事件在地图上永远不显示**；调研与访谈材料需补强 | §3.4 修复；补一段「试点数据」叙述（可用合成数据 + 明确标注） |
| **AI 技术应用** | 20 | 「AI 技术或工具选择合理，与项目融合紧密，技术实现难度高且效果好」得 14–20；「技术应用不充分」得 0–6 | ❌ 上报链路完全不可用；导航按钮点不到 | §2.1 / §2.3 必修；§4.3 修交互流畅度 |
| **项目实施** | 15 | 「实施方案完整，计划合理，关键技术实现良好，团队协作高效」得 10–15 | ❌ 上报 → AI → 打点这条主链走不通；路线文字指引为空 | §2.1 / §2.3 / §3.7（路线文案） |
| **应用成效** | 15 | 「成果显著，效益突出，数据详实」得 10–15 | 素材基础好：71 张成图 + 图集 + 实时输入接入设计文档 + 路网诊断工具 | 把 §3.5 的证据链截图、§1.2 的路网诊断输出、性能剖析数据整理成**可核验的成效证据** |
| **总结与展望** | 10 | 「总结全面准确，展望合理且具有前瞻性」得 7–10 | — | 收尾章 |
| **附录附加分** | 5 | 数据资料 / 注释详细的代码与模型 / 规范的参考文献 / 其他有力补充材料，每项加 1–2 分 | — | 见下方第 3 条 |

**另外三条硬约束（按新赛规口径重写）**

- **在线演示**：附件 1 第三节把「作品在线服务网址（若有）」列为提交项，`06-竞赛材料` 里已有公网静态站 ⇒ §4.4 的只读自动导览仍然直接对应这一条。
- **⚠️ 测试报告不得写进技术报告**：附件 1 第三节第 3 条规定「技术文件内**请勿包含**相关的论文、专利、软著、**测试报告**等补充材料，**此类材料放在佐证材料中**」。旧文档曾建议把路网诊断输出、性能 A/B 数据整理进方案 PDF 的「测试与验证」章——**这条已作废**，应改为放进**佐证材料 PDF**。
- **附录第 3 项（数据资料 / 代码与模型）**：附件 1 第六节第（七）条把「数据资料」「代码与模型」列为附录项 ⇒ 建议把 `_diag_road_nav.py` 的输出、`events.js` 的可信度分解、S5 的性能 A/B 数据做成一份《核心算法与测试报告》，放进**佐证材料**，既拿附录附加分又补强应用成效。

---

## 6 落地顺序建议

### 第一批：让作品能演（约半天）

| # | 改什么 | 出处 | 代码量 |
|---|---|---|---|
| 1 | 上报弹窗在选点期间让位 | §2.1 | ~15 行 |
| 2 | 补全下拉不再盖住「开始导航」 | §2.3 | ~5 行 |
| 3 | 回灌 `web-demo/` + `SRC_FILES` 加 `events.js` | §2.2 | 4 次复制 + 1 行 |
| 4 | 路线文字指引给本地兜底 | §3.7 | ~10 行 |
| 5 | 演示事件流去掉 12 条上限 | §4.1 | 1 行 |

做完这五条，产品从「演示不了」变成「可以完整走一遍」。

### 第二批：让 AI 被看见（约一天）

| # | 改什么 | 出处 |
|---|---|---|
| 6 | Mock 数据改为有分布的剧本（可信度出现梯度） | §3.1 |
| 7 | 模板绑定地点候选（文本与地点对得上） | §3.3 |
| 8 | 造同簇上报，让时空去重真正触发 | §3.2 |
| 9 | 安全类打半透明标记，不再永远隐形 | §3.4 |
| 10 | 审核徽标随事件更新 + 证据链置顶 | §3.5 |

做完这批，答辩时「AI 在做什么」有了画面。

### 第三批：把它变成产品（约一天）

| # | 改什么 | 出处 |
|---|---|---|
| 11 | 只读模式自动导览（7 机位轮播） | §4.4 |
| 12 | 事件 → 路网屏蔽 → 重算路径（全作品最有戏剧性的一幕） | §3.6 |
| 13 | 相机动画改用墙钟时间 + 自适应下限上调 | §4.3 |
| 14 | 事件列表增量更新，不再全量重建 | §4.2 |
| 15 | 恢复预设机位入口 + HUD 移位 + 首屏引导 | §4.5 / §4.6 / §4.7 |

### 第四批：材料对齐

16. 把 §1 的实测数据、`_diag_road_nav.py` 输出、可信度分解截图整理成《核心算法与测试报告》，进 `06-竞赛材料/05-佐证材料/`
17. 方案 PDF 增加「测试与验证」章；同步修正入口页里「7 个机位预设」的文案

---

## 7 附：复现方式

```bash
# 1. 起本地静态服务（必须 http，ES module 在 file:// 下被拒）
cd "02-三维资产/site"
"C:/Users/31967/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" -m http.server 8124 --bind 127.0.0.1

# 2. 浏览器打开（交互模式）
http://127.0.0.1:8124/preview.html?mode=interactive

# 3. 路网诊断（秒级，6 项检查）
cd "02-三维资产"
"C:/Users/31967/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" blender/scripts/_diag_road_nav.py
"C:/Users/31967/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" blender/scripts/_diag_road_nav.py --block outer_s2,outer_s3
```

**无头复现脚本**（本次评测所用）：`%TEMP%/trae_review/run3.cjs`、`run4.cjs`、`run5.cjs`
要点：`--disable-gpu --enable-unsafe-swiftshader`；用真实时间轮询 `window.__preview().ready`（`--virtual-time-budget` 不作用于 Draco 的 Web Worker）；截图路径不能带中文。

---

## 8 需要注意的两处「看起来是 bug，其实不是」

1. **`_diag_road_nav.py` 报 34 处「路网穿楼」** —— 其中大部分是**误报**：`智谷谷底`（下沉谷地，中轴本就穿过）、`主校门`（牌坊，道路本就穿门而过）、`环廊S4站`（站点在路口上）都不是实体建筑体量，路段经过它们是设计意图。**判据应该是「净距 < 0」，而现在的实现把「净距 = 0」（贴边）也算作穿楼。** 建议给这几类对象加白名单，或把判据改成 `< -0.5 m`。

2. **`_diag_road_nav.py` 报「宿舍E → 食堂: 0 m / 0 段」** —— 这是诊断工具自身的缺陷：它的 `nearest_road_node_by_entrance` 对这两栋楼返回了同一个节点。**浏览器里的真实结果是 63 m**（直线 68 m），是正确的。建议诊断工具与 `navigation.campus.js` 共用同一套吸附逻辑，避免两套实现各说各话。

---

*本报告的每一条结论都来自实机运行或代码核对，未采用推测。截图见 `05-测试与质量/评审证据_Trae版/`。*
