# 本校区本校区地图切换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CampusTwin 从山河大学 GLB 地图切换为本校区本校区地图体验，优先提供官方在线三维地图入口，并用官方发布的二维校园图作为稳定主视图和兜底。

**Architecture:** 页面不再把山河大学 GLB 当作当前校园地图。`campusMap.js` 提供本校区地图配置；`CampusPlanMap` 负责本地二维地图、地点标签、热点、模拟位置和路线覆盖；官方在线三维地图通过外部链接打开，不把外部站点嵌入为核心依赖。未来拿到本校区 GLB 后，只替换地图 provider，不改地点、事件和路线业务接口。

**Tech Stack:** React 19、Vite、Three.js（保留备用）、SVG/CSS 二维覆盖层、Vitest。

---

## 数据与来源约束

- 官方在线三维地图：`https://map.campus.example.invalid/`。
- 当前可用的官方发布校园平面图：`https://p8.itc.cn/q_70/images03/20201009/c379dde2acf948048f161f24ffe59b27.jpeg`。
- 页面必须显示“二维官方校园图 / 官方三维地图入口”来源说明。
- 官方三维站点可能出现验证跳转，因此不在 iframe 中依赖它；点击按钮打开新页面。
- 当前 `/public/assets/campus.glb` 是旧山河大学模型，不能继续作为本校区地图展示。
- 本地二维坐标是演示用空间标定，后续拿到更精确的官方数据或 GLB 后替换 `planPosition` 和路线图，不修改组件接口。

## 文件结构

| 文件 | 操作 | 职责 |
| --- | --- | --- |
| `src/data/campusMap.js` | 修改 | 切换到本校区本校区配置，保存官方地图和二维图来源 |
| `src/data/locations.js` | 修改 | 使用本校区核心地点名称、别名、服务和二维坐标 |
| `src/data/routeGraph.js` | 修改 | 保存二维地图坐标系下的节点和路线边 |
| `src/data/routeGraph.test.js` | 修改 | 校验地点与二维节点绑定 |
| `src/features/map/CampusPlanMap.jsx` | 新建 | 渲染二维官方图、地点标签、热点、当前位置和路线 |
| `src/features/map/campusPlan.js` | 新建 | 二维坐标转换和路线覆盖纯函数 |
| `src/features/map/campusPlan.test.js` | 新建 | 测试坐标投影、路线点和边界处理 |
| `src/features/map/MapWorkspace.jsx` | 修改 | 以二维地图 provider 替换当前 GLB 主视图，并保留官方三维入口 |
| `src/styles.css` | 修改 | 增加二维地图、来源栏、标签和路线样式 |
| `src/domain/route.test.js` | 修改 | 把默认起点和地点 id 迁移到本校区语义 |
| `src/app/campusReducer.js` | 修改 | 将默认起点迁移为西校门，保留动作接口 |
| `src/data/events.js` | 修改 | 将示例热点迁移到本校区真实地点 |

## Task 1: 固定本校区地图配置

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\data\campusMap.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\data\campusMap.test.js`（若不存在则创建）

- [ ] **Step 1: 写配置测试**

```js
import { describe, expect, it } from 'vitest'
import { teamCampusMap } from './campusMap.js'

describe('Campus campus map profile', () => {
  it('uses the Taigu campus and official map sources', () => {
    expect(teamCampusMap.campusName).toContain('本校区')
    expect(teamCampusMap.campusName).toContain('本校区')
    expect(teamCampusMap.mapMode).toBe('plan-2d')
    expect(teamCampusMap.officialMapUrl).toBe('https://map.campus.example.invalid/')
    expect(teamCampusMap.planImageUrl).toMatch(/^https:\/\//)
  })
})
```

- [ ] **Step 2: 运行测试确认旧配置失败**

Run: `npm test -- --run src/data/campusMap.test.js`

Expected: FAIL because the current profile is 山河大学 and has no `mapMode`/official Taigu map fields.

- [ ] **Step 3: 写最小地图配置**

```js
export const teamCampusMap = Object.freeze({
  campusName: '本校区 · 本校区',
  campusShortName: '本校区本校区',
  mapMode: 'plan-2d',
  modelUrl: null,
  officialMapUrl: 'https://map.campus.example.invalid/',
  planImageUrl: 'https://p8.itc.cn/q_70/images03/20201009/c379dde2acf948048f161f24ffe59b27.jpeg',
  mapSource: '本校区官方发布的校园地图攻略',
  mapVersion: '2020 官方发布图 · 二维演示底图',
  modelSource: '官方三维校园 GIS 入口',
  modelSourceUrl: 'https://map.campus.example.invalid/',
  previewSourceUrl: 'https://www.campus.example.invalid/',
})
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/data/campusMap.test.js`

Expected: PASS。

## Task 2: 迁移地点和路线数据到本校区语义

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\data\locations.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\data\routeGraph.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\data\events.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\data\routeGraph.test.js`

- [ ] **Step 1: 写地点绑定测试**

```js
it('uses Taigu campus places with 2D map positions', () => {
  const locations = locationRepository.loadAll()
  expect(locations.map((item) => item.id)).toEqual([
    'library', 'teaching-a', 'canteen', 'dormitory', 'gymnasium', 'west-gate',
  ])
  locations.forEach((location) => {
    expect(location.planPosition.x).toBeGreaterThanOrEqual(0)
    expect(location.planPosition.x).toBeLessThanOrEqual(100)
    expect(location.planPosition.y).toBeGreaterThanOrEqual(0)
    expect(location.planPosition.y).toBeLessThanOrEqual(100)
    expect(location.modelAnchorId).toBeNull()
  })
})
```

- [ ] **Step 2: 迁移地点名称和别名**

保留 `library`、`teaching-a`、`canteen`、`dormitory`、`gymnasium` 这些稳定业务 id，修改展示数据：

```js
{
  id: 'library',
  name: '图书馆',
  category: 'learning',
  modelAnchorId: null,
  entryNodeId: 'library-entry',
  planPosition: { x: 26, y: 44 },
  aliases: ['校图书馆', '图书馆新馆'],
  keywords: ['阅读', '自习', '借阅', '讲座'],
}
{
  id: 'teaching-a',
  name: '明德楼',
  category: 'learning',
  modelAnchorId: null,
  entryNodeId: 'chongxue-entry',
  planPosition: { x: 52, y: 48 },
  aliases: ['第三代图书馆旧址', '软件学院'],
}
{
  id: 'canteen',
  name: '禾香餐厅',
  category: 'dining',
  modelAnchorId: null,
  entryNodeId: 'guyuan-entry',
  planPosition: { x: 58, y: 55 },
  aliases: ['禾香', '学生食堂'],
}
{
  id: 'dormitory',
  name: '学生宿舍区',
  category: 'living',
  modelAnchorId: null,
  entryNodeId: 'dormitory-entry',
  planPosition: { x: 74, y: 38 },
  aliases: ['宿舍', '研究生宿舍'],
}
{
  id: 'gymnasium',
  name: '体育场馆区',
  category: 'service',
  modelAnchorId: null,
  entryNodeId: 'sports-entry',
  planPosition: { x: 78, y: 55 },
  aliases: ['体育场', '体育馆', '运动场'],
}
{
  id: 'west-gate',
  name: '西校门',
  category: 'transport',
  modelAnchorId: null,
  entryNodeId: 'west-gate-entry',
  planPosition: { x: 10, y: 53 },
  aliases: ['西门', '校园西门'],
}
```

所有地点保留现有状态、服务和第一人称字段；将 `east-gate` 全部迁移为 `west-gate`，因为官方资料把西校门作为主要入口。事件、reducer、测试中的默认起点同步迁移。

- [ ] **Step 3: 把路线节点改为二维百分比坐标**

路线节点保存 `position: { x, y }`，不要继续使用山河大学 GLB 的米制三维坐标：

```js
const node = (id, position, extra = {}) => ({ id, position, kind: 'junction', ...extra })

const nodes = {
  'west-gate-entry': node('west-gate-entry', { x: 10, y: 53 }, { locationId: 'west-gate', kind: 'location-entry' }),
  'central-lawn': node('central-lawn', { x: 34, y: 50 }),
  'library-entry': node('library-entry', { x: 26, y: 44 }, { locationId: 'library', kind: 'location-entry' }),
  'central-axis': node('central-axis', { x: 48, y: 49 }),
  'chongxue-entry': node('chongxue-entry', { x: 52, y: 48 }, { locationId: 'teaching-a', kind: 'location-entry' }),
  'guyuan-entry': node('guyuan-entry', { x: 58, y: 55 }, { locationId: 'canteen', kind: 'location-entry' }),
  'dormitory-entry': node('dormitory-entry', { x: 74, y: 38 }, { locationId: 'dormitory', kind: 'location-entry' }),
  'sports-entry': node('sports-entry', { x: 78, y: 55 }, { locationId: 'gymnasium', kind: 'location-entry' }),
}
```

边仍保留 `distance/accessible/covered/safeAtNight/blocked` 字段，A* 仍按业务距离工作；地图绘制只把路线点换算成百分比。

- [ ] **Step 4: 更新演示事件**

把现有“图书馆/体育馆/食堂”事件改成本校区语义，例如：禾香午餐高峰、图书馆讲座、体育场馆活动、西校门通行状态。事件不能再引用 `east-gate`。

- [ ] **Step 5: 运行数据测试**

Run: `npm test -- --run src/data/routeGraph.test.js src/data/events.test.js`

Expected: PASS，且不再出现 `east-gate` 或 `ANCHOR_*` 业务绑定。

## Task 3: 创建二维地图 provider

**Files:**

- Create: `D:\AI+软件赛道\CampusTwin\src\features\map\campusPlan.js`
- Create: `D:\AI+软件赛道\CampusTwin\src\features\map\campusPlan.test.js`
- Create: `D:\AI+软件赛道\CampusTwin\src\features\map\CampusPlanMap.jsx`

- [ ] **Step 1: 写坐标转换测试**

```js
import { describe, expect, it } from 'vitest'
import { planPointToPercent, routeNodesToPercent } from './campusPlan.js'

describe('campus plan helpers', () => {
  it('keeps plan coordinates in percentages', () => {
    expect(planPointToPercent({ x: 26, y: 44 })).toEqual({ left: '26%', top: '44%' })
  })

  it('converts route nodes into an ordered polyline', () => {
    const graph = { nodes: { a: { position: { x: 10, y: 20 } }, b: { position: { x: 30, y: 40 } } } }
    expect(routeNodesToPercent(['a', 'b'], graph)).toEqual([
      { left: '10%', top: '20%' },
      { left: '30%', top: '40%' },
    ])
  })
})
```

- [ ] **Step 2: 实现纯函数**

```js
export function planPointToPercent(point) {
  return { left: `${point.x}%`, top: `${point.y}%` }
}

export function routeNodesToPercent(nodeIds, graph) {
  return nodeIds.map((nodeId) => planPointToPercent(graph.nodes[nodeId].position))
}
```

- [ ] **Step 3: 实现二维地图组件**

`CampusPlanMap` 必须接收 `locations/visibleLocationIds/events/selectedId/currentLocationId/routePlan`，并提供：

- 远程官方平面图背景。
- 图片加载失败时的本地 SVG/CSS 简化底图，不能出现空白区域。
- 地点标签和热点标签。
- 蓝色模拟位置标记。
- 路线折线、起点和终点。
- 点击标签触发现有 `onSelectLocation`。
- “打开官方三维地图”按钮，链接到 `teamCampusMap.officialMapUrl`。

组件只消费业务数据，不在内部保存地点名称和路线算法。

## Task 4: 接入地图工作区

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\MapWorkspace.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\styles.css`

- [ ] **Step 1: 替换 viewer 分支**

将当前固定的 `Campus3DViewer` 改为：

```jsx
{teamCampusMap.mapMode === 'plan-2d' ? (
  <CampusPlanMap
    locations={locations}
    visibleLocationIds={visibleIds}
    events={visibleEvents}
    selectedId={selectedId}
    currentLocationId={currentLocationId}
    routePlan={routePlan}
    onSelectLocation={onSelectLocation}
  />
) : (
  <Campus3DViewer ... />
)}
```

保留现有地图搜索、状态统计、工具栏、路线面板和详情面板。

- [ ] **Step 2: 修改来源栏和无障碍文本**

来源栏显示“本校区官方二维校园图”，并提供“打开官方三维地图”链接。地图区域 `aria-label` 改为“本校区本校区二维校园地图”。

- [ ] **Step 3: 增加二维地图样式**

新增 `.campus-plan-map`、`.campus-plan-map__image`、`.campus-plan-map__fallback`、`.campus-plan-marker`、`.campus-plan-route` 等样式。路线和标记必须使用百分比定位，图片使用 `object-fit: contain`，不裁掉校园边缘。

- [ ] **Step 4: 运行构建**

Run: `npm run build`

Expected: PASS，且构建产物不再把山河大学 GLB 作为当前地图入口。

## Task 5: 迁移默认起点与运行时提示

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\app\campusReducer.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\SimulatedLocationPicker.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\Campus3DViewer.jsx`
- Modify: affected tests under `src/app` and `src/domain`

- [ ] **Step 1: 把默认起点迁移为西校门**

所有默认回退从 `east-gate` 改为 `west-gate`；模拟位置清空提示改为“未选择，路线从西校门开始”。

- [ ] **Step 2: 防止备用 3D viewer 误显示旧模型说明**

保留 `Campus3DViewer` 供未来本校区 GLB 使用，但它不能在 `plan-2d` 模式被创建；错误提示中的 `assets/campus.glb` 仅保留在备用组件内部。

- [ ] **Step 3: 运行完整测试**

Run: `npm test -- --run`

Expected: 所有现有测试和新增地图配置、二维坐标测试通过。

## Task 6: 浏览器验收

- [ ] 启动：`npm run dev -- --host 127.0.0.1`
- [ ] 打开 `http://127.0.0.1:5173/`。
- [ ] 确认标题显示“本校区 · 本校区”。
- [ ] 确认二维校园图加载；断开图片后仍显示本地简化底图。
- [ ] 搜索“图书馆”，确认标签出现在二维图上并能打开详情。
- [ ] 规划西校门到图书馆路线，确认路线沿二维图显示。
- [ ] 切换管理员，发布禾香拥挤或图书馆活动，确认热点绑定地点。
- [ ] 选择模拟位置，确认蓝色位置标记和路线起点变化。
- [ ] 点击“打开官方三维地图”，确认打开 `https://map.campus.example.invalid/`。
- [ ] 刷新页面，确认主流程没有回到山河大学名称。

## 完成定义

- 页面当前主地图语义全部是本校区本校区。
- 官方三维地图作为外部入口存在，但不成为本地演示的单点故障。
- 官方二维校园图或本地简化底图始终可显示。
- 地点标签、热点、模拟位置和路线共享同一套二维坐标。
- 原山河大学 GLB 不再作为当前地图使用。
- 测试、构建和浏览器主流程通过。

## 备注

当前 CampusTwin 目录不是 Git 仓库，因此本计划按文件、测试和浏览器验收记录，不虚构 commit。
