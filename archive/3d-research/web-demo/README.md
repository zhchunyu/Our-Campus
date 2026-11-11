# 校园实时态势地图 · 3D 原型

> 单场景闭环 Demo：**学生上报 → AI 判断去重 → 地图打点 → 他人可见**

这是「未来校园社区软件」的 3D 可视化原型，也是 3D 资产管线的第一个可运行版本。

---

## 一、怎么跑起来

**方式 A：本地服务（推荐）**

ES Module + importmap 需要 HTTP 协议，直接双击 `index.html`（file://）会被浏览器拦截。

```bash
cd 02-三维资产/web-demo
python -m http.server 8123
# 然后浏览器打开 http://localhost:8123
```

**方式 B：任意静态服务器**

放到 Nginx / Vite / Live Server 里都能直接跑，无需构建步骤。

---

## 二、演示动线（建议按这个顺序看）

| 步骤 | 操作 | 看点 |
| --- | --- | --- |
| 1 | 打开页面，等开场动画 | 相机从校门外飞入，鸟瞰全校园 |
| 2 | 点「▶ 自动演示」 | 每 4 秒产生一条上报，看 AI 逐步判断 |
| 3 | 点击任意光柱 | 右侧展开 AI 判断详情：分类、可信度、去重结果、处理链路 |
| 4 | 点「＋ 上报一条信息」 | 先在地图上点位置 → 选类型 → 提交 → 观察 AI 处理 |
| 5 | 连续在同一位置上报同一类型 | 触发 **AI 去重合并**，信息流里标记「已合并」 |
| 6 | 点「↺ 重置视角」 | 拉远看全局态势 |

---

## 三、已实现的未来感设计

- **全息地面网格** + 冷色调夜景色板（青蓝 / 紫）
- **建筑夜景窗格**：程序化 Canvas 贴图，随机点亮窗户
- **道路光带**：加色混合的流动光带
- **建筑光柱**：从屋顶向上延伸的淡光柱，表达"数据感"
- **图书馆扫描环**：双环反向旋转 + 上下浮动
- **路网数据流粒子**：260 个粒子沿路网流动，强化"实时"感
- **事件标记**：双层脉冲环 + 光柱 + 浮动标签，按类型配色

---

## 四、代码结构

```
web-demo/
├── index.html            # 页面骨架 + UI 布局 + importmap（产品 Demo：实时态势地图）
├── preview.html          # ★ 全园模型预览页（独立于产品 Demo，见第七节）
├── src/
│   ├── styles.css        # 视觉样式（深色未来感）
│   ├── landmarks.js      # 精细地标建筑（图书馆 / 校门 / 体育馆）+ 通用楼栋
│   ├── campus.js         # 校园总装（布局 / 路网 / 绿化 / 灯光 / 粒子）
│   ├── events.js         # 事件系统 + 标记渲染 + AI 判断模拟
│   ├── app.js            # 主程序（场景 / 相机 / 交互 / UI 联动）
│   └── preview.js        # ★ 预览页主程序（GLB 加载 / 相机预设 / 统计）
├── tools/
│   └── _shot_webgl.cjs   # ★ Playwright 无头截图（可等待条件，绕开虚拟时间限制）
├── assets/
│   └── campus.glb        # ★ 全园模型（由 exports/ 复制而来，勿手工编辑）
├── vendor/three/         # three.js 0.186.0 本地副本（MIT）+ Draco 解码器
└── data/                 # 预留：数据
```

### 调试用 URL 参数

做视觉核查时不必手改代码，直接拼参数即可定位机位：

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `cam=x,y,z` | 指定相机位置 | `?cam=64,30,86` |
| `tgt=x,y,z` | 指定视点 | `?tgt=0,20,0` |
| `nointro=1` | 跳过开场动画 | `?nointro=1` |
| `events=N` | 预置 N 条事件（跳过首屏自动播报） | `?events=9` |
| `auto=1` | 自动开始演示 | `?auto=1` |

例：近景核查图书馆 → `http://localhost:8123/?nointro=1&events=1&cam=64,30,86&tgt=0,20,0`

---

## 五、迭代记录（视觉核查发现并修掉的问题）

以下问题都是**用无头浏览器实际渲染截图后**发现的，靠读代码看不出来：

| # | 现象 | 根因 | 处理 |
| --- | --- | --- | --- |
| 1 | 所有楼立面呈"砖块"状 | `BoxGeometry` 六面共用 0→1 UV，长立面把窗格横向拉伸十几倍 | 新增 `facadeMaterials()`，按每个面的真实尺寸换算平铺次数 |
| 2 | 屋顶整体发亮（食堂像顶了个米黄色盖子） | 屋顶光冠用了整块 `MeshBasicMaterial` 板，六面全发光 | 改为 `crownFrame()` 四边光框 |
| 3 | 图书馆立面糊成一整块蓝板 | 竖向遮阳翼出挑 2.0、间距 1.95，斜视时相邻翼片互相遮挡 | 翼片收窄到 0.85、间距拉到 2.6 |
| 4 | 校门被一个"蓝色圆桶"吞掉 | 弧形顶棚半径 7.5 且压在横梁上 | 半径收至 5.2、抬到横梁之上，加肋条 |
| 5 | 树长在路和校门广场中间 | 绿化撒点只排除了建筑与道路，没排除广场 | 增加广场排除区 + 铺装前广场 |
| 6 | **连续上报时页面抛异常** | `renderFeed()` 直接读 `ev.ai.credibility`，而此时 AI 流程还没跑完 | 补 `!ev.ai` 兜底，状态显示"AI 分析中…" |
| 7 | 演示里「AI 合并」恒为 0 | 随机撒点几乎不可能落进 80 单位的去重半径 | 新增 `spawnEvent()`，35% 概率落在已有事件附近 |
| 8 | 控制台有 `THREE.Clock` 废弃警告 | three r18x 已弃用 `Clock`、移除 `PCFSoftShadowMap` | 改用 `performance.now()` 计时 + `PCFShadowMap` |

---

## 六、下一步（待办）

- [ ] **把全园 GLB 接进产品 Demo** —— 目前 GLB 只在独立的 `preview.html` 里（第七节）。
      接进 `index.html` 有两种路子：① 用 GLB 整体替换 `campus.js` 的程序化校园
      （`landmarks.js` 里的 `buildLibrary` / `buildGate` 即可退役）；
      ② 保留程序化体块做"轻量态"，GLB 作为"精细态"按需加载。
      **先做①还是②取决于移动端性能预算** —— GLB 是 1.12 M 面 / 42 材质，
      在低端机上需要先做 LOD
- [ ] 引入 `cad` skill 生成的 STEP/DXF，作为建筑轮廓的精确依据
- [ ] 接入真实校园路网数据（OSM / 图纸）
- [ ] 事件数据改为从后端 WebSocket 推送（当前为前端模拟）
- [ ] 移动端性能降级：LOD 切换 + 2.5D 模式
- [ ] 深色/浅色双主题

---

## 七、全园模型预览页 `preview.html`

**独立于产品 Demo**：它不加载 `src/app.js` 那套实时态势地图，只做"把 GLB 看清楚"这一件事。
这样产品 Demo 的演示动线不会被模型加载时间打断，模型也能单独给评审看。

```bash
cd 02-三维资产/web-demo
python -m http.server 8123
# 打开 http://localhost:8123/preview.html
```

| 项 | 值 |
| --- | --- |
| 模型 | `assets/campus.glb`（4.62 MB / **1,118,087 三角面** / 375 网格 / **42 材质** / 0 贴图） |
| 压缩 | **Draco 必需**（`KHR_draco_mesh_compression` 是 `extensionsRequired`） |
| 就绪耗时 | ~780 ms（本机，含 Draco 解码） |
| 帧率 | 64 FPS（软件渲染 SwiftShader；带阴影时 DrawCall 754） |
| 相机预设 | 7 个，数值直接取自 `configs/rN.json` 的真实 Blender 机位 |

**URL 参数**：`preset=<名字>` / `cam=x,y,z` / `tgt=x,y,z` / `shadow=0` / `trans=1`。
给了 `cam` 或 `tgt` 就不再套默认预设（这条一开始写错过：加载回调里无条件套了默认预设，
把 URL 机位覆盖掉）。

### 踩过的两个坑（都在这里）

| # | 现象 | 根因 | 处理 |
| --- | --- | --- | --- |
| 1 | 页面永远停在"正在加载全园模型 4.6 MB / 4.6 MB" | **`--virtual-time-budget` 不作用于 Web Worker**，而 Draco 解码跑在 Worker 里 ⇒ 虚拟时间认为"没活干"立刻截图 | 改用 Playwright（`tools/_shot_webgl.cjs`，真实时间 + `waitForFunction` 等 `window.__preview().ready`） |
| 2 | 整体过曝发白，连深色水面都泛白 | `scene.environment`（PMREM）本身提供强环境辐照，默认 `environmentIntensity = 1.0`，等于在 hemi + dir + ambient 之外又加一盏天光 | 压到 `hemi 0.40 / dir 2.20 / ambient 0.06 / environmentIntensity 0.30`，`toneMapping` 用 `NeutralToneMapping`（对齐 Blender 的 Khronos PBR Neutral） |

**Blender → three.js 换算**：坐标 `(x, y, z) → (x, z, −y)`；
镜头 Blender 给的是水平 FOV（36 mm 传感器），three 要垂直 FOV ⇒
`fov = 2 · atan((18 / lens) / aspect) · 180 / π`。

详细交付说明（尺度 / 轴向 / 已知限制 / 验证矩阵 / 如何重新生成）见
`02-三维资产/exports/山河大学_全园GLB_交付说明.md`。

---

## 八、说明

- `vendor/three/` 为 three.js 官方发行版（MIT License），已随附 LICENSE
- 场景中不含任何学校名称、校徽、门牌等标识 —— 符合赛事"不得出现学校信息"的要求
- AI 判断流程为**前端模拟**，用于演示产品逻辑；真实实现由算法组在后端完成
