# 项目长期记忆 —— 春雨工作区

> ★★ **本文件只是索引，不是手册。** 具体做法全在两支 skill 里，**动手前先加载**：
> - **`blender-socket-modeling`**（200 KB）—— 几何坑 / 构件签名 / **完整 28 条铁律** / **静默失效全量** / R0~R6 参数速查
> - **`spa-webgl-page-inspector`** —— 前端 3D 页面分析、验证、**性能量化剖析与优化配方**、光效实现铁律
>
> 过程细节在 `.workbuddy-ai/memory/YYYY-MM-DD.md`（每日**追加**，勿覆盖）。

## 0 合规红线（不可违反）
- 对外材料（方案 / 视频 / PPT）**禁止出现学校名称、Logo、指导教师**
- **全项目不出现任何题字**（匾额留空白石板）
- 视频 3-5 min；方案 PDF ≤10 MB；网盘链接须永久有效

## 1 身份与节奏
- 第八届全球校园 AI 算法精英大赛 · AI+软件创新赛道（赛题 2）；产品 = 面向 C 端的未来校园社区软件
- 工作区 `C:\Users\31967\Desktop\全国人工智能精英算法大赛\春雨工作区`；**我只负责建模 + 前端三维呈现**
- ★★ **汇报节奏（硬要求）**：每完成一阶段即停下汇报，确认后再进下一阶段；**不擅自批量破坏性动作**
- ★★ **安全约定（2026-09-26 事故后立）**：**任何密钥都不许写进源码**。AI Key 由使用者在页面弹窗输入 → `localStorage`；
  仓库/站点里出现 `sk-` 一律视为事故。★ 泄露后**吊销重签只能由账号持有人到服务商后台做**，我做不到

## 2 当前状态（依据 `02-三维资产/规划调整方案V3.md`，执行偏差见其 §7）

| 阶段 | 内容 | 状态 |
|---|---|---|
| S1 | 建筑间距 / 分区扩地 | ✅ 生活区岸线太窄无法扩地 → 改缩楼体（**待向用户说明**） |
| S2 | 路网重构 | ✅ 36 轮迭代，判据「路网穿楼相交面积 = 0」 |
| S3 | 环廊垂直交通 | ✅ 2026-09-25 |
| S4 | 立面格构 / 分区景观 / 屋面分色 / 缓丘 | ✅ a·b·c·d 全完成 |
| S5 | 全量重渲 + 重导 GLB + 站点重部署 | ✅ 71 张重渲 / GLB 重导 / 三路验证通过 |
| S6 | 3D 预览页性能优化 + 密钥安全清理 | ✅ 2026-09-26（明细见 skill `spa-webgl-page-inspector`） |

**交付物**
- 成图 `renders/` **71 张**（R0~R6 各 7/8/8/9/11/12/16 + R7 8；70 张 1600×900，`R0_垂直书院_正立面` 1000×1600）
- GLB **`山河大学_全园_R7.glb`**：5.70 MB / 1 536 071 面（导出前 2 317 949 面 / 393 对象 / 72 材质）
- 图集 `02-三维资产/建模图集/`：桌面打印版 + **单文件手机版**（base64 内嵌）+ `选图清单.md`
- ★ **总览 = 对照页（内部，讲改了什么）／图集 = 陈列页（对外，讲设计是什么）**
- ★★ **HTML 交付物必须自包含**（相对路径 + 中文文件名 = 换设备就缺图，实测手机全裂）

**S3~S5 关键结论**（数字为改后值）
- S3 垂直交通：站点 **15 处**（V3 写的 13 是错的）= 开敞双跑楼梯 11 + 1:12 坡道 2 + 电梯塔 2；最大间距 121 m；侵入建筑 0.00 m²
- S4-a 立面：横条纹来源在 `build_campus_r5.py:solid_body()`（**V3 §3.1 点名的 `fin_facade()` 是错的**）；
  「实墙 + 竖向格构 + 竖长窗」后 `gy/gx` 2.770→**0.562**；A/B `BR_R5_LANG=0`
- S4-b/c 景观：`build_campus_r7_landscape.py`（挂 `_entrance_all.py` 后、`palette_retune.py` 前）；
  硬质占分区地面 100%→**43.3%**、绿地占陆地 31.92%→**41.77%**、`pave` 24.92%→**14.13%**、`tree` 1.58%→**2.50%**
  **未做**：浅凹 −0.8 m（地形零厚度 ⇒ 不可实现）、生活区 +1.5 m 台地（会埋掉 R5/R6 落位基准）
- S4-d 屋面：`palette_retune.py` V2.5→**V2.6**（修掉"两个钛锌材质"静默失效）；屋面 `B>R` 71~78%→**41~44%**；A/B `BR_ROOF_V2=1`
- S5：`CAMPUS_TAIL` 把 `_entrance_all.py` + `build_campus_r7_landscape.py` 提到**所有阶段**（否则图集割裂）；
  链长 r0(9)/r1(9)/r2(10)/r3(11)/r4(12)/r5(14)/r6(15)

**其他**
- 归档：`99-临时工作区/{视觉分型验证,分区景观验证,垂直交通验证,屋面配色验证}/`
- ★ **视觉叙事方案**（09-24）：`02-三维资产/视觉叙事方案.md`，主轴 R0~R6 → **四幕：命题/转译/序列/栖居**。
  **人眼机位 = `Z 4.6`**（`Z_TOP 3.0` + 眼高 1.6）—— 统计机位高度必须用此基准
- 下一步 = `06-竞赛材料` 的方案 PDF / 视频 / PPT 正文（守 §0）

## 3 环境与网络
- **无头渲染一律用便携版** `C:/Users/31967/Blender/blender-4.5.9-windows-x64/blender.exe`（MSIX 5.2.2 不能命令行调用）
- Blender 脚本用 `.../python/versions/3.13.12/python.exe`（无 PIL）；
  图像处理 / Playwright 用 `.../envs/default/Scripts/python.exe`（有 PIL/requests/playwright，无 numpy）
- ★★ **网络经代理**：`github.com:443` CONNECT 返 **502 ⇒ `git push` 走不通**；**`api.github.com` 可达**
  ⇒ 推仓库走 **Git Data API**（`tools/push_via_api.py`：blobs→tree→commit→ref）。
  ★ **代理端口每次会话都会变** ⇒ 不当常量；判断"是不是代理问题"要**直连对照**（`curl` 不带 `-x` 再试）
- ★ **公网部署用 `workbuddy_sites_deploy`**（静态站传 `02-三维资产/site/`）
  ★★ 用户没在**最新一条消息**里要求发布时**必须先问**；`userAskedToPublish` 不许为绕检查设 true
- MCP `~/.workbuddy-ai/mcp.json` → `blender`（桥接 `blender_bridge.py`:9876）
- ★ **远程仓库** `https://github.com/zhchunyu/Chun-Yu`（**private**），交付分支 **`main`**（旧分支 `feat/2d-map-initial`）；
  `.blend` 走 Release（tag **`blend-projects`**）。最近推送 2026-09-26 → 远端 `main` = **`853884a5`**
- ★★ **推送方式（2026-09-26 定）**：日常用 **`tools/push_delta.py`**（**只推差异**）——
  以远端 head 的 tree 作 `base_tree`，只列新增/修改/删除项；`--dry-run` 可先看差异。
  全量建仓才用 `push_via_api.py --stage light`。
  ★ **`github.com` 根路径 200 ≠ `git push` 能通**（实测 180 s 无输出被 SIGTERM）；判据只能是真跑一次。
  ★★ **blob 内容必须用 `git cat-file blob <sha>` 取，不能读工作区文件** ——
  `.gitattributes` 做了行尾归一化（工作区 CRLF / 库里 LF），读磁盘算出的 SHA 与
  `git ls-tree` 给的**对不上**，校验必然失败。日志里的字节数是 LF 后的（比磁盘小）
- ★★ **入库策略（2026-09-26 用户定）**：**单张成图不入库** —— `renders/` 与 `08-交付与归档/renders_*` 只留
  图集 HTML 与站点。`.gitignore` 已登记 `/08-交付与归档/renders_*/`、`/02-三维资产/blender/projects/_tmp_*.blend`、
  `/02-三维资产/99-临时工作区/`、`/.trae-html-share-packages/`、`/picture/`
  ★ `renders/` 里 64 个历史文件**仍在库中**（gitignore 不追溯已跟踪文件）⇒ 会长期显示为 modified
  ★ **远端 tree 里没有 `.blend`**（走 Release）⇒ 比对时 `only-local` 出现 24 个 `.blend` 是**正常**的

## 4 管线
`BR_CFG_FILE=<json> blender.exe --background --factory-startup --python scripts/run_campus.py`

`build_campus_site.py` → `build_extra[]`：
`stage1→2→3→r0→…→r6→_trees_hero→_teach_detail→_entrance_all→`**`build_campus_r7_landscape`**`→palette_retune.py`
（**配色重标恒为末项**）→ 存 `.blend` → 渲染 → **导出 GLB**（最后：压平/抽稀是破坏性的）

- ★ **唯一真源 `configs/_src/rN_final.json`** → `make_render_configs.py` → `configs/rN.json`
- ★ **多阶段共享同一个 globals**，后跑阶段**覆盖同名全局变量** ⇒ 跨脚本传数据惯例：
  `RING_LOOP / RING_STATIONS / ring_at()`、`ENT_LIST`、`STATION_LIST`。★ 但**定义只许有一处**
- ★ **成图目录只能用 `BR_RENDER_DIR` 改**；三档 800×450/24 → 960×540/32 → 1600×900/110
- **A/B 开关**：`BR_R5_LANG` · `BR_GRASS_V24` · `BR_ROOF_V2` · `BR_PALETTE_LINKED` · `BR_RENDER_DIR` ·
  `BR_PLAN_FLIP/CROP/BBOX` · `BR_VT_CAMS/ONLY/CAM/TGT` · `BR_ENT_DIST/LAT/UP` · `BR_VTC_SAMP`
- **常用量具**：`_diag_plan.py`（**大改几何后必跑**，判据「路网穿楼相交面积 = 0」）· `check_ab.py` ·
  `check_palette.py`（**必须分上下半图**）· `_diag_r5band.py`（逐**面**判）· `_diag_vt_clear.py`（1.3 m 薄边侵入）·
  `_dump_palette.py`（材质色板真源 → `renders/材质色板.json`）· `make_site.py` · `push_via_api.py`
  ⇒ **完整清单 + 每条工具的口径与坑，见 skill**

## 5 静默失效 —— **共 23 条，逐条详情与代码全在 skill `blender-socket-modeling`**
只说最反直觉的三条：
- ★★ **同一工程里可能有"两个同名概念"的材质**：`M_钛锌屋面板`(1 对象) vs `M_钛锌板`(32 对象)
  ⇒ 只重标前者 = **整个第五立面从未被改过**。改材质前先按名字**全量列出所有 `M_*`**
- ★★ **改材质前先数用户数**（`users` 只是计数；漏一个名字 = 整批没改**且不报错**）
- ★★ **验收判据会"自己把成果吃掉"**（命中树冠归成硬质 ⇒ 刚种完的草坪反而变"硬"）
  ⇒ 判地面要**两级射线**（高空判建筑 / 低空 `Z_TOP+1.4` 判地面）

## 6 前端 3D（预览页 / 站点）—— 细节见 skill `spa-webgl-page-inspector`
**两套并存的页面**
- `site/preview.html` + `src/preview.js` + `src/navigation.campus.js` —— **加载 `campus.glb` 的成果预览页**（正式交付）
- `web-demo/index.html` + `src/app.js` + `src/navigation.js` —— **「校园实时态势地图」产品原型**（几何 JS 程序化生成，演示尺度）

- ★★ **`site/` 是 `tools/make_site.py` 的产物**；补丁一律打在 `web-demo/` + `tools/`
  `make_site.py` 的 `SRC_FILES = ('preview.js','navigation.campus.js')`，并**清掉 `src/` 里不在白名单的 `.js`**
- ★★ **站点入口一律用公网链接，不要双击 `site/index.html`**：ES module 在 `file://` 下 origin 为 `null` ⇒ 脚本被拒
  ⇒ 3D 遮罩永远停在「连接中…」。已加**经典脚本守卫** + `site/serve.cmd`（本地 `http://localhost:8123`）
- ★ **公网地址（2026-09-26 最新）**：`https://31321d19210d4bab87da7637df1dabc9.sg2.agentos-app.run`
  ★★ **同一个沙箱会有多个别名，内容逐字节相同**（沙箱 ID `2cb735b0c4814c359bab62cc039d9c7a` **不变**，
  每次发布回一个新别名）。现有别名：`31321d19…`（最新）· `2b66b692…` · `2cb735b0…` · `304afd6c…`
  ⇒ 结论：**旧链接不失效，但工具每次可能回一个新别名**
- ★★ **部署是"覆盖解压"，不是"镜像同步" —— 本地删掉的文件不会从线上消失**
  （实测：本地已删 `site/src/navigation.js`，重新部署后线上**仍 200 且逐字节是旧版** 45,049 B，
  里面那个真实 API Key **依然能被公网 curl 到**）
  ⇒ 清密钥只能靠**同名文件覆盖**：`make_site.py` 每次构建写一份**不含密钥**的垫片回去。
  ⇒ 验证必须打到**线上**、覆盖**全部别名**，且用**完整密钥串** `grep -F` 精确匹配（别只 `grep 'sk-'`，
  平台兜底页里有 `mask-type` 会误报）。★ "根路径 200"**不能**证明"子路径没残留"（兜底 HTML 也算 200）
- ★★ **性能优化结果（2026-09-26）**：远机位 drawn 3,070,710→**1,535,523**、calls 788→**396**；
  近机位 2,765,364→**1,230,177**、calls 605→**213**。
  **主因是"阴影 pass 每帧重算"（`shadowMap.autoUpdate=false` 后 drawn 直接腰斩，画面阴影一模一样），
  其次是 dpr；用户以为的"特效太华丽"只占 +36 call** —— 已如实说明。
  落地：`?quality=high|balanced|perf` + `?dpr= ?shadow= ?smapsize= ?softshadow= ?aa= ?adapt=` + 自适应分辨率
- ★★ **量性能前必读 skill 里的"三个陷阱"**（异步 draw 会报假 60 fps / `gl.finish()` 只信计数不信耗时 / 必须同机位 A/B）

## 7 山河大学（主线）设定与路线
- **完全虚构校园**；设计以 `01-产品设计/` 为准（`设计任务书.md` D1~D10 / `设计方案修订纲要V2.md` / `总平面格局图.svg`）
- ★ 几何：**1 SVG px = 2.4 m**；原点 = 主校门 `(340,516)`；`W(sx,sy)=((sx−340)*2.4,(516−sy)*2.4)`；
  **X 东 / Y 北 / Z 上**；`Z_TOP 3.0` / 水面 `0.0` / `Z_BANK −3.4`；场地 X[−816,816] Y[0,1238]
- 命名 `BLD_<分区>_<Name>` / `SITE_*` / `ANCHOR_*`（中轴节点 Y 全表见 skill）
- 路线 R0 语言样板 → R1 山门+智谷 → R2 图书馆+讲堂 → R3 人文区 → R4 环廊 → R5 五区 → R6 滨水 → **R7 整合/预览/GLB**
- 三条跨阶段硬约束：①"取消"类构件提前到最早重做该区域的阶段拆除 ②清障只删 V2 已定"拆除/取消"的
  ③"改造"类保留旧版作"改造前"语境；实现走 `make_render_configs.py` 的 `STAGE_EXTRA`（**改生成器，不改阶段脚本**）
- 归档在 `08-交付与归档/`；总览页栏数按"有没有可对照的上一版"分档，硬凑两栏会写出 **404 的 img**

## 8 最高频铁律 —— **完整 28 条在 skill**，这里只留反复救命的 5 条
- ★ **"某块太重/太黑"先量体量再谈颜色**（多数"太黑"其实是"太厚"）；**改配色后先 A/B 量化再全量重渲**
- ★ **删掉一个"提供立体感"的构件，立体感不会自动转移** —— 修法不是把挑檐加回来（那就成了横条纹），
  而是把**竖柱挑深**（0.40 → 0.52~0.64）
- ★ **同一套节奏要在两处落件时，分格口径必须共用**（柱 `(i+0.5)/m` / 窗 `i/m` 天然错开半格；
  各算各的 ⇒ 柱窗错缝，**近景一眼假，且不报错**）
- ★ **"再叠一层同类构件"多半是错的** —— 同一视觉意图，用**一套构件 + 换材质**表达
- **"盒子扣壳"一定读成机库 —— 缺的不是曲面，是檐**；**大面镜墙这个想法本身是错的**

## 9 产品接入层（2026-09-26 建）—— 路网 / 锚点 / 事件
> 详细设计与实测数据见 `.workbuddy-ai/memory/2026-09-26.md` §八

**架构原则**：**数据源可插拔** —— `EventSource` 三实现（Mock 回放 / **Manual 现场手动上报** / Real App 上报），
上层管线（抽取→锚点→去重→核查→发布）不知道数据从哪来；演示数据与真实数据**共用同一条管线**。
路线重算**不改 `aStar()`，改 `buildGraph(blockedSet)`**（动态屏蔽集合）。

**现成零件**（别重写）：
- `site/src/navigation.campus.js`：`ROAD_NODES` **97 节点** / `ROAD_EDGES` **109 边** / `aStar` /
  `computeRoadRoute` / `smoothPath` / `nearestRoadNode`（**带入口朝向筛选**）/ `RouteRenderer`（流动粒子）/ `BUILDINGS` 30 项
- `web-demo/src/events.js`：`EVENT_TYPES` 5 类 / `TEMPLATES` 5×4 条学生语料 / `AI_STEPS` 5 步 / `runAIPipeline`

**★★★ 三个已知缺陷 —— ✅ 2026-09-26 已由 Trae 版修掉**（详见 §10）
1. **锚点表曾是阶段 0 占位坐标** ⇒ 现改为**从 `BUILDINGS` 派生**（`buildAnchors()`），偏差收敛到 4 例且均为站台/谷地误报
2. **中轴与南段外环无连接边** ⇒ 已补 `axis_gate↔outer_s2`：主校门→食堂 **844 → 315 m**；封路 **278 → 878 m（+216%）**
3. **生活区北排 4 栋 `entrance` 朝向反了** ⇒ 已改 `south`：宿舍E→食堂 **554 → 63 m**
   ★ 但 `outer_s3↔inner_e_s4` / `outer_s2↔inner_w_s5` 两条边**仍未补**

**判据**：改完路网必跑 `_diag_road_nav.py`（Trae 新增，6 项诊断，纯 Python 秒级）；
★ 它的「路网穿楼」把「净距 = 0」（贴边）也算穿楼 ⇒ 对智谷/主校门牌坊/站点有**大量误报**；
★ 它的「宿舍E→食堂 0 m」是工具自身缺陷（吸附实现与 JS 不一致），**浏览器实测 63 m 才对**

## 10 Trae 版实现（2026-09-26）—— 状态与隐患
> 完整评审见 `05-测试与质量/Trae版实现评审与改进建议.md`；实测数据见 `2026-09-26.md` §十一

**Trae 新增了什么**：`site/preview.html` + `site/src/{preview.js, navigation.campus.js, events.js}` ——
事件面板 / 上报弹窗 / 审核工作台 / 模式开关（readonly·interactive）/ 地图选点 /
真 AI 管线（`extractSchema` → `spatiotemporalDedupe` → `computeCredibility` 可分解）/
`_diag_road_nav.py`。**架构方向对，工程量不小，但演示不了。**

**★★★ 两条必须最先处理**
1. **改动全落在 `site/`（构建产物）** —— `web-demo/` 里一个字都没有。
   `make_site.py:284` 的 `SRC_FILES = ('preview.js','navigation.campus.js')` **不含 `events.js`**，
   且会删白名单外的 `.js` ⇒ **跑一次构建即全部归零，且不报错**。
   ⇒ 先回灌四个文件到 `web-demo/`，再把 `events.js` 加进 `SRC_FILES`
2. **上报链路完全走不通** —— `#report-modal` 是 `inset:0;z-index:40` 全屏遮罩，点「地图选点」后弹窗不关
   ⇒ 画布收不到任何点击 ⇒ 提交按钮永久 disabled（逻辑本身正确，只是被挡住；修法约 15 行）

**★★ 五处「AI 看不出在工作」**：可信度恒 53–55%（UGC 永不过 65% 阈值 ⇒ 12 条待核实 / 1 条已发布）·
时空去重从不触发（Mock 均匀取点，间距 > 150 m）· 文本与地点不对应（13 条里 7+ 条矛盾）·
安全类事件**永远不打点**（阈值 0.75 恒不满足，越紧急越不显示）· 判定分解藏在审核面板底部点开看不见

**其他**：事件流 12 条封顶 ⇒ **约 105 秒后静止**；路线文字指引恒为空
（`generateRouteDescription` 未配 Key 时 `return null` 而非 throw，调用方 `textContent = null` ⇒ 空串）；
只读模式相机 12 s 完全静止（公网链接是张静止图）；**封路动态屏蔽未实现**（`buildGraph()` 无参数、静态建一次）；
`#presets` 被 CSS 隐藏但入口页仍宣传；`#stats` 被 `#nav-panel` 完全遮住

