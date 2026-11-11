# （历史）模型建筑标签与地图路线 Implementation Plan

> **已被新版实施计划替代。** 当前执行入口为 `2026-09-26-campus-twin-foundation-and-event-loop.md`；本文保留已完成的模型锚点、路线和第一人称实现记录，不再作为后续开发顺序依据。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将山河大学 GLB 模型中的建筑锚点、校园道路节点与现有地点/路线 UI 连接起来，使标签和路线真正跟随三维地图。

**Architecture:** 地点数据通过 `modelAnchorId` 绑定 GLB 的 `ANCHOR_*` 节点；`Campus3DViewer` 负责读取锚点、投影标签和绘制路线；独立的 `routeGraph.js` 保存与模型同坐标系的道路图，`route.js` 使用 A* 根据路线模式计算节点路径。应用层继续使用现有 reducer 和本地数据源，未来只替换数据源而不改地图交互。

**Tech Stack:** React 18、Vite、Three.js、GLTFLoader、DRACOLoader、Vitest、现有 `lucide-react` 图标。

**工作区说明:** `D:\AI+软件赛道\CampusTwin` 当前没有 `.git` 目录，因此本计划用可重复的测试、构建和浏览器验收作为检查点，不虚构 commit 操作。

---

## 文件结构与职责

| 文件 | 操作 | 职责 |
| --- | --- | --- |
| `src/data/locations.js` | 修改 | 为现有 6 个地点增加模型锚点和路线入口字段 |
| `src/data/routeGraph.js` | 新建 | 保存模型坐标中的道路节点、边属性和地点入口映射 |
| `src/data/routeGraph.test.js` | 新建 | 校验路线图结构、入口存在性和道路属性 |
| `src/domain/route.js` | 修改 | 将固定演示距离替换为 A* 路径计算，并保持现有返回字段兼容 |
| `src/domain/route.test.js` | 修改 | 覆盖五种模式、施工绕行、无障碍和不可达情况 |
| `src/app/campusReducer.js` | 修改 | 在真实路线图上生成和切换路线 |
| `src/app/campusReducer.test.js` | 修改 | 校验 reducer 的路线动作使用真实点位与路线点 |
| `src/features/map/campus3d.js` | 新建 | 保存锚点注册、屏幕投影和路线点转换等可测试纯函数 |
| `src/features/map/campus3d.test.js` | 新建 | 测试三维坐标投影、屏幕可见性和锚点缺失结果 |
| `src/features/map/Campus3DViewer.jsx` | 修改 | 加载 GLB 后读取锚点、更新标签位置并绘制三维路线 |
| `src/features/map/MapWorkspace.jsx` | 修改 | 删除固定百分比标签/热点/路线，将业务数据传给三维地图 |
| `src/styles.css` | 修改 | 增加三维标签、引导线、路线状态样式，删除旧演示线依赖 |
| `docs/superpowers/specs/2026-09-21-model-anchored-labels-and-routes-design.md` | 已有 | 作为实现验收依据，不再重复定义业务规则 |

## Task 1: 先固定地点锚点和路线图数据契约

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\data\locations.js`
- Create: `D:\AI+软件赛道\CampusTwin\src\data\routeGraph.js`
- Create: `D:\AI+软件赛道\CampusTwin\src\data\routeGraph.test.js`

- [ ] **Step 1: 为地点数据写锚点契约测试**

在 `src/data/routeGraph.test.js` 中先写：

```js
import { describe, expect, it } from 'vitest'
import { locationRepository } from './locations.js'
import { campusRouteGraph, getEntryNodeId } from './routeGraph.js'

describe('campus model bindings', () => {
  it('maps every demo location to a model anchor and an entry node', () => {
    const locations = locationRepository.loadAll()

    expect(locations).toHaveLength(6)
    locations.forEach((location) => {
      expect(location.modelAnchorId).toMatch(/^ANCHOR_/)
      expect(getEntryNodeId(location.id)).toBeTruthy()
      expect(campusRouteGraph.nodes[getEntryNodeId(location.id)]).toBeTruthy()
    })
  })

  it('uses GLB coordinates in metres for core locations', () => {
    expect(campusRouteGraph.nodes['library-entry'].position).toEqual([0, 4, -518.4])
    expect(campusRouteGraph.nodes['main-gate-entry'].position).toEqual([0, 4, -33.6])
    expect(campusRouteGraph.nodes['gymnasium-entry'].position).toEqual([-336, 4, -187.2])
  })
})
```

- [ ] **Step 2: 运行测试确认契约先失败**

Run:

```powershell
cd D:\AI+软件赛道\CampusTwin
npm test -- --run src/data/routeGraph.test.js
```

Expected: FAIL because the six location objects do not yet have `modelAnchorId`, and `routeGraph.js` does not exist.

- [ ] **Step 3: 给现有地点增加模型绑定字段**

在 `src/data/locations.js` 的 6 个地点对象中增加以下字段：

```js
modelAnchorId: 'ANCHOR_Library',
entryNodeId: 'library-entry',
```

完整映射必须是：

```js
const MODEL_BINDINGS = Object.freeze({
  library: { modelAnchorId: 'ANCHOR_Library', entryNodeId: 'library-entry' },
  'teaching-a': { modelAnchorId: 'ANCHOR_Teaching_A', entryNodeId: 'teaching-a-entry' },
  canteen: { modelAnchorId: 'ANCHOR_Canteen', entryNodeId: 'canteen-entry' },
  dormitory: { modelAnchorId: 'ANCHOR_Dorm_West', entryNodeId: 'dorm-west-entry' },
  gymnasium: { modelAnchorId: 'ANCHOR_Gymnasium', entryNodeId: 'gymnasium-entry' },
  'east-gate': { modelAnchorId: 'ANCHOR_Main_Gate', entryNodeId: 'main-gate-entry' },
})
```

把绑定字段直接展开到对应地点对象，并在 `loadAll()` 中继续保留现有的关键词副本逻辑。不要改变现有地点 id，避免搜索、事件和 reducer 断链。

- [ ] **Step 4: 创建与 GLB 坐标一致的最小路线图**

在 `src/data/routeGraph.js` 中写入以下接口和数据：

```js
const node = (id, position, extra = {}) => ({ id, position, kind: 'junction', ...extra })

export const campusRouteGraph = Object.freeze({
  nodes: Object.freeze({
    'main-gate-entry': node('main-gate-entry', [0, 4, -33.6], { locationId: 'east-gate', kind: 'location-entry' }),
    'axis-plaza': node('axis-plaza', [0, 4, -129.6]),
    'axis-mound': node('axis-mound', [0, 4, -244.8]),
    'axis-hospital': node('axis-hospital', [-120, 4, -355.2]),
    'axis-library': node('axis-library', [0, 4, -470.4]),
    'library-entry': node('library-entry', [0, 4, -518.4], { locationId: 'library', kind: 'location-entry' }),
    'teaching-junction': node('teaching-junction', [96, 4, -321.6]),
    'teaching-a-entry': node('teaching-a-entry', [201.6, 4, -321.6], { locationId: 'teaching-a', kind: 'location-entry' }),
    'east-plaza': node('east-plaza', [201.6, 4, -129.6]),
    'canteen-junction': node('canteen-junction', [244.8, 4, -76.8]),
    'canteen-entry': node('canteen-entry', [302.4, 4, -76.8], { locationId: 'canteen', kind: 'location-entry' }),
    'dorm-junction': node('dorm-junction', [-96, 4, -76.8]),
    'dorm-west-entry': node('dorm-west-entry', [-206.4, 4, -76.8], { locationId: 'dormitory', kind: 'location-entry' }),
    'gym-junction': node('gym-junction', [-244.8, 4, -187.2]),
    'gymnasium-entry': node('gymnasium-entry', [-336, 4, -187.2], { locationId: 'gymnasium', kind: 'location-entry' }),
  }),
  edges: Object.freeze([
    { from: 'main-gate-entry', to: 'axis-plaza', distance: 96, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'axis-plaza', to: 'axis-mound', distance: 116, accessible: true, covered: false, blocked: false, safeAtNight: true },
    { from: 'axis-mound', to: 'axis-library', distance: 240, accessible: true, covered: false, blocked: false, safeAtNight: true },
    { from: 'axis-library', to: 'library-entry', distance: 54, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'axis-mound', to: 'axis-hospital', distance: 156, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'axis-hospital', to: 'gym-junction', distance: 142, accessible: true, covered: false, blocked: true, safeAtNight: true },
    { from: 'dorm-junction', to: 'gym-junction', distance: 190, accessible: true, covered: false, blocked: false, safeAtNight: true },
    { from: 'gym-junction', to: 'gymnasium-entry', distance: 92, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'axis-mound', to: 'teaching-junction', distance: 164, accessible: true, covered: false, blocked: false, safeAtNight: true },
    { from: 'teaching-junction', to: 'teaching-a-entry', distance: 112, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'teaching-junction', to: 'east-plaza', distance: 192, accessible: false, covered: true, blocked: false, safeAtNight: false },
    { from: 'axis-plaza', to: 'dorm-junction', distance: 168, accessible: true, covered: false, blocked: false, safeAtNight: true },
    { from: 'dorm-junction', to: 'dorm-west-entry', distance: 118, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'east-plaza', to: 'canteen-junction', distance: 120, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'canteen-junction', to: 'canteen-entry', distance: 64, accessible: true, covered: true, blocked: false, safeAtNight: true },
    { from: 'dorm-junction', to: 'canteen-junction', distance: 312, accessible: true, covered: false, blocked: false, safeAtNight: false },
  ]),
})

export function getEntryNodeId(locationId) {
  return Object.values(campusRouteGraph.nodes).find((item) => item.locationId === locationId)?.id ?? null
}
```

在导出前用 `Object.freeze` 固定节点和边，避免管理员演示操作意外修改基础路线图。图中至少保留一条有遮雨属性的路径和一条可绕开的施工边，保证路线模式有可观察差异。

- [ ] **Step 5: 运行数据契约测试确认通过**

Run:

```powershell
npm test -- --run src/data/routeGraph.test.js
```

Expected: PASS，包含 2 个数据契约测试。

Checkpoint: 此时搜索和详情数据不应改变，只完成模型绑定与路线图数据层。

## Task 2: 用 A* 替换固定演示路线

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\domain\route.js`
- Modify: `D:\AI+软件赛道\CampusTwin\src\domain\route.test.js`

- [ ] **Step 1: 先补充真实路线行为的失败测试**

在现有 `route.test.js` 中保留旧的空参数测试，并增加：

```js
import { campusRouteGraph } from '../data/routeGraph.js'
import { createCampusRoute } from './route.js'

it('returns model-coordinate points for a shortest route', () => {
  const route = createCampusRoute({
    originId: 'east-gate',
    destinationId: 'library',
    mode: ROUTE_MODES.SHORTEST,
    graph: campusRouteGraph,
  })

  expect(route.status).toBe('preview')
  expect(route.nodeIds[0]).toBe('main-gate-entry')
  expect(route.nodeIds.at(-1)).toBe('library-entry')
  expect(route.points[0]).toEqual([0, 4, -33.6])
  expect(route.points.at(-1)).toEqual([0, 4, -518.4])
  expect(route.distance).toBeGreaterThan(0)
})

it('avoids blocked edges for avoid-construction mode', () => {
  const route = createCampusRoute({
    originId: 'east-gate',
    destinationId: 'gymnasium',
    mode: ROUTE_MODES.AVOID_CONSTRUCTION,
    graph: campusRouteGraph,
  })

  expect(route.status).toBe('preview')
  expect(route.nodeIds).not.toContain('axis-hospital')
})

it('returns an unavailable result instead of a fake line when no route exists', () => {
  const graph = { nodes: { a: { position: [0, 4, 0] }, b: { position: [1, 4, 0] } }, edges: [] }
  const route = createCampusRoute({
    originId: 'a-location',
    destinationId: 'b-location',
    originNodeId: 'a',
    destinationNodeId: 'b',
    graph,
  })

  expect(route).toMatchObject({ status: 'unavailable', points: [], nodeIds: [] })
})
```

- [ ] **Step 2: 运行测试确认当前固定实现不满足**

Run:

```powershell
npm test -- --run src/domain/route.test.js
```

Expected: FAIL because `createCampusRoute` is not defined and the existing function has no model-coordinate points.

- [ ] **Step 3: 实现图遍历、模式约束和 A***

在 `route.js` 中新增以下职责，保留现有 `createDemoRoute` 的导出名作为兼容包装：

```js
function edgeAllowed(edge, mode) {
  if (mode === ROUTE_MODES.ACCESSIBLE && !edge.accessible) return false
  if (mode === ROUTE_MODES.AVOID_CONSTRUCTION && edge.blocked) return false
  return true
}

function edgeCost(edge, mode) {
  if (mode === ROUTE_MODES.RAIN) return edge.distance * (edge.covered ? 0.65 : 1.35)
  if (mode === ROUTE_MODES.NIGHT) return edge.distance * (edge.safeAtNight ? 0.8 : 1.3)
  return edge.distance
}

function heuristic(a, b) {
  const dx = a.position[0] - b.position[0]
  const dz = a.position[2] - b.position[2]
  return Math.hypot(dx, dz)
}

export function createCampusRoute({ originId, destinationId, mode = ROUTE_MODES.SHORTEST, graph = campusRouteGraph, originNodeId, destinationNodeId }) {
  if (!originId || !destinationId || originId === destinationId) return null

  const start = originNodeId ?? getEntryNodeId(originId)
  const goal = destinationNodeId ?? getEntryNodeId(destinationId)
  if (!start || !goal || !graph.nodes[start] || !graph.nodes[goal]) return unavailableRoute(originId, destinationId, mode)

  const adjacency = buildAdjacency(graph.edges, mode)
  const open = new Set([start])
  const cameFrom = new Map()
  const gScore = new Map([[start, 0]])
  const fScore = new Map([[start, heuristic(graph.nodes[start], graph.nodes[goal])]])

  while (open.size) {
    const current = [...open].sort((a, b) => fScore.get(a) - fScore.get(b))[0]
    if (current === goal) return buildRouteResult({ originId, destinationId, mode, nodeIds: reconstruct(cameFrom, current), graph })
    open.delete(current)
    for (const connection of adjacency.get(current) ?? []) {
      const tentative = gScore.get(current) + edgeCost(connection.edge, mode)
      if (tentative >= (gScore.get(connection.nodeId) ?? Infinity)) continue
      cameFrom.set(connection.nodeId, current)
      gScore.set(connection.nodeId, tentative)
      fScore.set(connection.nodeId, tentative + heuristic(graph.nodes[connection.nodeId], graph.nodes[goal]))
      open.add(connection.nodeId)
    }
  }

  return unavailableRoute(originId, destinationId, mode)
}
```

`buildAdjacency()` 必须把每条边加入双向邻接表；`buildRouteResult()` 用原始 `distance` 累加真实边长，使用 `points = nodeIds.map((id) => graph.nodes[id].position)`，并按每 60 米约 1 分钟计算 `durationMinutes`，最少为 1。`unavailableRoute()` 返回 `status: 'unavailable'`、空 `nodeIds`、空 `points`、零距离和零时长。

`createDemoRoute(args)` 改为调用 `createCampusRoute({ ...args, graph: campusRouteGraph })`，这样 reducer 和旧调用方无需同时重写。

- [ ] **Step 4: 运行路线测试确认通过**

Run:

```powershell
npm test -- --run src/domain/route.test.js src/data/routeGraph.test.js
```

Expected: PASS，包含旧兼容测试、真实坐标测试、施工绕行测试和不可达测试。

## Task 3: 让 reducer 始终保存真实路线结果

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\app\campusReducer.js`
- Create or modify: `D:\AI+软件赛道\CampusTwin\src\app\campusReducer.test.js`

- [ ] **Step 1: 为路线动作补充失败测试**

用现有 `createInitialState()` 创建包含 locations/events 的 state，增加：

```js
it('creates a model-bound route when a destination is selected', () => {
  const state = createInitialState(locationRepository.loadAll(), [])
  const next = campusReducer(state, { type: 'SET_ROUTE_DESTINATION', destinationId: 'library' })

  expect(next.routePlan).toMatchObject({
    originId: 'east-gate',
    destinationId: 'library',
    status: 'preview',
  })
  expect(next.routePlan.points.at(-1)).toEqual([0, 4, -518.4])
  expect(next.routePlan.nodeIds.at(-1)).toBe('library-entry')
})

it('recalculates the same endpoints when the route mode changes', () => {
  const state = createInitialState(locationRepository.loadAll(), [])
  const withRoute = campusReducer(state, { type: 'SET_ROUTE_DESTINATION', destinationId: 'gymnasium' })
  const next = campusReducer(withRoute, { type: 'SET_ROUTE_MODE', mode: ROUTE_MODES.AVOID_CONSTRUCTION })

  expect(next.routePlan.mode).toBe(ROUTE_MODES.AVOID_CONSTRUCTION)
  expect(next.routePlan.originId).toBe('east-gate')
  expect(next.routePlan.destinationId).toBe('gymnasium')
  expect(next.routePlan.points.length).toBeGreaterThan(1)
})
```

- [ ] **Step 2: 运行 reducer 测试确认先失败或暴露旧字段**

Run:

```powershell
npm test -- --run src/app/campusReducer.test.js
```

Expected: FAIL until reducer tests are wired to the updated route result.

- [ ] **Step 3: 保持动作接口，统一调用真实路线生成器**

在 `campusReducer.js` 中继续使用 `createDemoRoute` 兼容入口，确认以下三个动作都把 `mode`、`nodeIds`、`points` 传回 state：

```js
case 'SET_ROUTE_ORIGIN':
  return { ...state, routePlan: createDemoRoute({ originId: action.originId, destinationId, mode, graph: campusRouteGraph }) }
case 'SET_ROUTE_DESTINATION':
  return { ...state, selectedId: action.destinationId, routePlan: createDemoRoute({ originId, destinationId: action.destinationId, mode, graph: campusRouteGraph }) }
case 'SET_ROUTE_MODE':
  return state.routePlan
    ? { ...state, routePlan: createDemoRoute({ originId: state.routePlan.originId, destinationId: state.routePlan.destinationId, mode: action.mode, graph: campusRouteGraph }) }
    : state
```

如果 `routePlan.status === 'unavailable'`，仍然保留路线面板以显示不可达原因，但地图不传入路线几何。不要在 reducer 中重新写算法。

- [ ] **Step 4: 运行全部 domain/app 测试**

Run:

```powershell
npm test -- --run src/domain src/app src/data
```

Expected: PASS，搜索、角色、事件和路线状态测试全部通过。

## Task 4: 添加可测试的三维锚点投影工具

**Files:**

- Create: `D:\AI+软件赛道\CampusTwin\src\features\map\campus3d.js`
- Create: `D:\AI+软件赛道\CampusTwin\src\features\map\campus3d.test.js`

- [ ] **Step 1: 写投影工具测试**

```js
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { projectWorldToContainer, isProjectedPointVisible } from './campus3d.js'

describe('campus 3D helpers', () => {
  it('projects a world point into container pixels', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    const point = projectWorldToContainer(new THREE.Vector3(0, 0, 0), camera, 400, 200)
    expect(point.x).toBeCloseTo(200)
    expect(point.y).toBeCloseTo(100)
    expect(point.depth).toBeGreaterThan(-1)
    expect(point.depth).toBeLessThan(1)
  })

  it('marks points behind the camera as hidden', () => {
    expect(isProjectedPointVisible({ x: 20, y: 20, depth: 1.2 }, 400, 200)).toBe(false)
    expect(isProjectedPointVisible({ x: 20, y: 20, depth: 0.5 }, 400, 200)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认工具不存在**

Run:

```powershell
npm test -- --run src/features/map/campus3d.test.js
```

Expected: FAIL with module/function-not-found errors.

- [ ] **Step 3: 实现投影和可见性工具**

在 `campus3d.js` 中实现：

```js
export function projectWorldToContainer(worldPosition, camera, width, height) {
  const projected = worldPosition.clone().project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    depth: projected.z,
  }
}

export function isProjectedPointVisible(point, width, height) {
  return point.depth >= -1 && point.depth <= 1 && point.x >= -32 && point.x <= width + 32 && point.y >= -32 && point.y <= height + 32
}

export function collectModelAnchors(model, locations) {
  const anchors = new Map()
  locations.forEach((location) => {
    const object = model.getObjectByName(location.modelAnchorId)
    if (object) anchors.set(location.id, object)
  })
  return anchors
}
```

`collectModelAnchors()` 不抛异常；调用方负责记录缺失地点并显示“待校准”。

- [ ] **Step 4: 运行三维工具测试确认通过**

Run:

```powershell
npm test -- --run src/features/map/campus3d.test.js
```

Expected: PASS。

## Task 5: 将 Campus3DViewer 改为锚点标签与三维路线容器

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\Campus3DViewer.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\MapWorkspace.jsx`

- [ ] **Step 1: 定义 Viewer 的业务 props**

保持 `modelUrl` 必填，并加入：

```jsx
<Campus3DViewer
  modelUrl={teamCampusMap.modelUrl}
  locations={locations}
  visibleLocationIds={visibleIds}
  events={visibleEvents}
  selectedId={selectedId}
  routePlan={routePlan}
  onSelectLocation={onSelectLocation}
/>
```

`Campus3DViewer` 自己拥有 Three.js 场景和叠加层，但不读取 reducer；所有业务信息由 props 进入。

- [ ] **Step 2: 在模型加载回调中注册锚点**

在 `Campus3DViewer.jsx` 的 `loader.load(..., gltf => {})` 中：

```js
const anchorMap = collectModelAnchors(gltf.scene, locationsRef.current)
missingAnchorsRef.current = locationsRef.current.filter((location) => !anchorMap.has(location.id))
modelAnchorsRef.current = anchorMap
```

用 refs 保存 `locations`、`visibleLocationIds`、`events`、`selectedId` 和 `routePlan`，避免每次筛选或切换路线都重新加载 GLB。缺失锚点只输出一次 `console.warn`，不阻断模型显示。

- [ ] **Step 3: 添加跟随相机的地点标签 DOM 层**

在 viewer 容器中保留 canvas，并增加：

```jsx
<div className="campus-3d-annotations" aria-label="地图地点标签">
  {locations.map((location) => (
    <button
      className={`campus-3d-label ${selectedId === location.id ? 'is-selected' : ''}`}
      data-location-id={location.id}
      key={location.id}
      onClick={() => onSelectLocation(location.id)}
      type="button"
    >
      <span>{location.name}</span>
      <small>{CATEGORY_LABELS[location.category]}</small>
    </button>
  ))}
</div>
```

每次渲染循环中，用锚点 `getWorldPosition()`、`projectWorldToContainer()` 更新对应 button 的 `style.transform`；点在镜头后方或地图外时设置 `hidden`。标签初始位置使用 `opacity: 0`，首次投影成功后显示，避免跳动。

标签仅显示 `visibleLocationIds` 中的地点；选中地点始终允许显示，以免筛选后详情失去定位反馈。热点按照 `event.locationId` 找到相同地点标签，在标签旁显示一个状态圆点和事件数量，不创建独立的随机位置。

- [ ] **Step 4: 在 Three.js 场景绘制路线对象**

在 viewer 的 scene 中创建一个独立 `routeGroup`。收到新的 `routePlan.points` 时：

```js
    while (routeGroup.children.length) {
      const object = routeGroup.children.pop()
      object.geometry?.dispose()
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
      else object.material?.dispose()
    }
    if (routePlan?.status === 'preview' && routePlan.points.length > 1) {
  const points = routePlan.points.map(([x, y, z]) => new THREE.Vector3(x, y + 1.2, z))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x64e8d5, transparent: true, opacity: 0.95 })
  routeGroup.add(new THREE.Line(geometry, material))
}
```

同时增加起点/终点圆点或小型 Sprite，名称使用路线的 `originId` 和 `destinationId`。更新路线前必须释放旧 geometry/material；组件卸载时释放 routeGroup 内全部对象，避免切换模式造成 GPU 资源泄漏。

- [ ] **Step 5: 在 MapWorkspace 删除旧的固定地图元素**

删除以下旧实现：

- `buildingPositions` 数组。
- `map-building` 的百分比定位按钮。
- `locations.slice(4)` 的百分比 marker。
- `visibleEvents.map(... style={{ left, top }})` 的随机热点。
- `map-route-line` 固定 CSS 路线。
- 3D 模式下不再渲染 `map-grid`、`map-water`、`map-road-*`、`map-tree-*` 这些旧示意层。

把地点、事件、筛选 id、选中 id、路线和选择回调统一传给 `Campus3DViewer`。保留指南针、地图来源说明和状态覆盖层。

- [ ] **Step 6: 添加三维标签和状态样式**

在 `styles.css` 增加：

```css
.campus-3d-annotations { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.campus-3d-label { position: absolute; pointer-events: auto; transform: translate3d(-9999px, -9999px, 0); display: grid; gap: 2px; padding: 7px 10px; border: 1px solid rgba(255,255,255,.18); border-radius: 10px; background: rgba(8, 22, 31, .86); color: #eefcf8; box-shadow: 0 10px 28px rgba(0,0,0,.2); white-space: nowrap; }
.campus-3d-label small { color: #8fb9b2; font-size: 10px; }
.campus-3d-label.is-selected { border-color: #64e8d5; box-shadow: 0 0 0 3px rgba(100,232,213,.16), 0 12px 30px rgba(0,0,0,.24); }
.campus-3d-label__hotspot { width: 7px; height: 7px; border-radius: 50%; background: #ffb55e; }
```

如果现有选择器与这些类冲突，以 3D viewer 的局部选择器为准；不要恢复百分比定位。

- [ ] **Step 7: 运行应用并进行第一次浏览器检查**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

浏览器检查：

1. 模型加载完成后，图书馆标签位于图书馆模型附近。
2. 拖动/缩放镜头时，标签和建筑同步移动。
3. 点击标签能打开原有地点详情。
4. 搜索或分类筛选不会产生固定在旧位置的标签。

Expected: 无旧 CSS 假标签、无运行时异常。

## Task 6: 接入路线面板和路线状态降级

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\features\routes\RouteDock.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\styles.css`
- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\MapWorkspace.jsx`

- [ ] **Step 1: 为不可达路线增加可复用的显示判断**

在 `RouteDock.jsx` 中增加一个纯函数并直接使用它，便于不依赖浏览器的单元测试：

```jsx
export function getRouteStatusLabel(routePlan) {
  return routePlan?.status === 'unavailable' ? '当前模式下没有可用路线' : `约 ${routePlan.durationMinutes} 分钟`
}

{routePlan.status === 'unavailable' ? (
  <span className="route-dock__unavailable">当前模式下没有可用路线</span>
) : (
  <span className="route-dock__duration">约 {routePlan.durationMinutes} 分钟</span>
)}
```

模式按钮仍可以切换，以便用户选择其他模式；不可达时不显示“演示路线”文案。

- [ ] **Step 2: 让地图只接收有效路线几何**

保持 `routePlan` 原对象传给 `Campus3DViewer`，由 viewer 的路线更新函数统一执行 `routePlan?.status === 'preview' && routePlan.points.length > 1` 判断；否则清空 `routeGroup`。不可达路线不能残留上一次的 Three.js line。

- [ ] **Step 3: 运行应用验证五种模式**

浏览器操作：

1. 点击图书馆，规划路线，确认路线从校门入口指向图书馆入口。
2. 切换“避雨路线”，确认路线点序列和折线发生变化。
3. 切换“避开施工”，确认路线不经过施工边。
4. 选择体育馆，确认施工/绕行逻辑可见。
5. 清除路线，确认三维路线和起终点标记消失。

Expected: 路线绘制在模型地面附近，不再是地图容器上的斜向 CSS 线。

## Task 7: 端到端验收、性能检查和清理旧代码

**Files:**

- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\Campus3DViewer.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\features\map\MapWorkspace.jsx`
- Modify: `D:\AI+软件赛道\CampusTwin\src\styles.css`
- Modify: `D:\AI+软件赛道\CampusTwin\src\domain\route.test.js`

- [ ] **Step 1: 清理迁移后不再使用的选择器和常量**

用以下命令确认旧实现只剩无关的兼容样式，地点定位和路线不再引用：

```powershell
rg -n "buildingPositions|map-building|map-marker|map-hotspot|map-route-line|map-road--|map-tree--" src
```

Expected: 不再有 `MapWorkspace.jsx` 中的地点/热点/路线引用；如果旧选择器只被旧 2D demo 使用，则删除对应 CSS。

- [ ] **Step 2: 增加锚点与路线回归测试**

在现有回归测试中保留这些断言：

```js
expect(locationRepository.loadAll().find((item) => item.id === 'library')).toMatchObject({
  modelAnchorId: 'ANCHOR_Library',
  entryNodeId: 'library-entry',
})
expect(createCampusRoute({ originId: 'east-gate', destinationId: 'library' }).points.length).toBeGreaterThan(1)
```

确保未来替换地点数据时，绑定字段缺失会在测试中立即暴露。

- [ ] **Step 3: 运行完整测试**

Run:

```powershell
npm test -- --run
```

Expected: 所有测试 PASS，当前基线的 22 个测试不减少，并新增锚点、路线和投影测试。

- [ ] **Step 4: 构建生产包**

Run:

```powershell
npm run build
```

Expected: Vite 构建成功。Three.js/Draco 的大 chunk 警告如果仍存在，只记录为后续性能优化，不在本次功能范围内。

- [ ] **Step 5: 做浏览器验收记录**

在 `http://127.0.0.1:5173/` 完成以下流程并记录结果：

```text
访客模式 → 搜索图书馆 → 点击模型附近的图书馆标签
→ 查看详情 → 规划路线 → 确认路线贴着三维地图显示
→ 旋转/缩放地图 → 标签和路线仍在建筑/道路附近
→ 管理者模式 → 发布图书馆热点或修改状态
→ 返回地图 → 热点仍绑定图书馆，路线可重新计算
```

Expected: 主流程无报错，模型加载失败时仍显示明确错误状态，管理员演示功能不受影响。

## 实施完成判定

- [ ] 设计规格中的模型锚点、三维标签、路线图、五种路线模式、未来 API 边界均有对应代码或测试。
- [ ] 不再使用固定百分比地点标签和 CSS 演示路线。
- [ ] `npm test -- --run` 通过。
- [ ] `npm run build` 通过。
- [ ] 浏览器端完成图书馆标签和路线的旋转缩放验收。

## 追加实施项：模拟我的位置与第一人称漫游

### Task 8: 模拟位置作为导航与漫游入口

- 在应用状态中维护 `currentLocationId`，默认不选位置，路线起点回退为东门。
- 在可收起的地图工具栏中提供“我的位置”面板，使用现有地点数据作为演示位置源。
- 位置变化后，当前已有路线自动以新位置重新计算；三维地图显示蓝色当前位置标记。
- 用 reducer 测试覆盖位置选择、路线重算和清空状态。

### Task 9: 第一人称模式

- 在工具栏提供“第一人称”切换，默认保持俯视模式。
- 第一人称从模拟位置的建筑锚点和 `firstPersonSpawnOffset` 进入，避免摄像机生成在建筑内部。
- 支持 WASD/方向键移动、按住鼠标拖拽环顾、Esc 或“返回俯视”退出，并限制在校园演示边界内。
- 第一人称隐藏地点标签，退出后恢复原俯视镜头、标签和当前位置标记。

### 新增验收

```text
收起工具栏 → 点击“我的位置” → 面板自动展开
→ 选择图书馆 → 蓝色当前位置标记出现
→ 规划路线 → 路线起点变为图书馆
→ 切换第一人称 → 从图书馆附近进入漫游
→ WASD/拖拽操作 → Esc 返回俯视 → 标签和路线恢复
```

当前已验证：37 个测试通过，生产构建通过，演示浏览器中无新增 Pointer Lock 控制台错误。
