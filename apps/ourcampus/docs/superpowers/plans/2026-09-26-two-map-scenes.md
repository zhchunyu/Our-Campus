# 2D / 3D 双场景地图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CampusTwin 中加入默认 2D 官方平面图与可切换 3D GLB 模型，并让搜索、路线、热点、模拟位置和管理员状态在两个场景之间保持一致。

**Architecture:** `MapWorkspace` 负责场景选择和共享工具，`Campus2DViewer` 与 `Campus3DViewer` 只负责各自的地图渲染。地点与路线节点保存 2D 归一化坐标和 3D 模型坐标；切换场景只改变投影层，不复制业务状态。

**Tech Stack:** React 19、Vite、Three.js、Vitest、CSS、官方校园平面图 JPEG、本地 GLB。

---

## 文件边界

- Create: `public/assets/campus-plan.jpeg` — 本校区官方校园平面图本地副本。
- Modify: `src/data/campusMap.js` — 双场景地图资源和来源配置。
- Modify: `src/data/locations.js` — 六个演示地点的 2D / 3D 显示坐标。
- Modify: `src/data/routeGraph.js` — 路线节点增加 2D 坐标。
- Modify: `src/app/campusReducer.js` — 增加 `mapScene` 与场景切换动作。
- Modify: `src/app/campusReducer.test.js` — 验证场景切换不会清空业务状态。
- Modify: `src/App.jsx` — 将场景状态传入地图工作区并接收切换动作。
- Create: `src/domain/mapScene.js` — 场景类型、坐标投影和路线投影函数。
- Create: `src/domain/mapScene.test.js` — 验证 2D / 3D 投影及缺失坐标行为。
- Create: `src/features/map/MapSceneSwitcher.jsx` — 地图左上角 2D / 3D 分段切换控件。
- Create: `src/features/map/Campus2DViewer.jsx` — 官方平面图、标记、路线和当前位置渲染。
- Modify: `src/features/map/MapWorkspace.jsx` — 选择地图渲染器并保持共享图层。
- Modify: `src/features/map/Campus3DViewer.jsx` — 从双场景配置读取模型，并支持没有模型锚点时使用坐标元数据。
- Modify: `src/styles.css` — 2D 图层、切换控件、加载/错误状态和响应式布局。

项目目录当前没有 Git 元数据，因此执行阶段不执行 `git commit`；每个任务以测试或构建结果作为检查点，不修改无关文件。

### Task 1: 添加官方 2D 资源和双场景配置

**Files:**
- Create: `public/assets/campus-plan.jpeg`
- Modify: `src/data/campusMap.js`

- [ ] **Step 1: 下载并核对 2D 官方平面图**

Run:

```powershell
Invoke-WebRequest `
  -Uri 'https://p8.itc.cn/q_70/images03/20201009/c379dde2acf948048f161f24ffe59b27.jpeg' `
  -OutFile 'public/assets/campus-plan.jpeg'
Get-Item 'public/assets/campus-plan.jpeg' | Select-Object FullName,Length
```

Expected: 文件存在且大小大于 0；该图作为官方校园地图文章中的平面图使用，后续在界面来源说明中保留来源链接。

- [ ] **Step 2: 将地图配置改为双场景结构**

用下面的配置替换 `src/data/campusMap.js` 的导出对象：

```js
export const teamCampusMap = Object.freeze({
  campusName: '本校区 · 本校区数字孪生',
  defaultScene: '2d',
  scenes: {
    '2d': {
      imageUrl: '/assets/campus-plan.jpeg',
      imageWidth: 1080,
      imageHeight: 514,
      sourceUrl: 'https://www.sohu.com/a/423304539_702284',
      sourceLabel: '本校区校园平面图',
    },
    '3d': {
      modelUrl: '/assets/campus-extracted.glb',
      modelSource: '公开 Unity 三维场景提取的 GLB',
      modelSourceUrl: 'https://guodont.github.io/one-3d/campusWeb3D/campusWeb3D.html',
      modelSize: '40.0 MB',
    },
  },
})
```

- [ ] **Step 3: 检查资源和配置**

Run:

```powershell
Test-Path 'public/assets/campus-plan.jpeg'
Test-Path 'public/assets/campus-extracted.glb'
rg -n "defaultScene|campus-plan|campus-extracted" src/data/campusMap.js
```

Expected: 两个资源路径都返回 `True`，配置中不存在旧的 `山河大学` 文案。

### Task 2: 先写场景状态测试，再实现 reducer

**Files:**
- Modify: `src/app/campusReducer.test.js`
- Modify: `src/app/campusReducer.js`

- [ ] **Step 1: 增加失败测试**

在 `campus reducer` 测试末尾加入：

```js
it('starts in the 2D scene and switches without clearing shared map state', () => {
  const withRoute = campusReducer(initialState, {
    type: 'SET_ROUTE_DESTINATION',
    destinationId: 'library',
  })
  const withSelection = campusReducer(withRoute, {
    type: 'SELECT_LOCATION',
    locationId: 'library',
  })
  const nextState = campusReducer(withSelection, { type: 'SET_MAP_SCENE', scene: '3d' })

  expect(initialState.mapScene).toBe('2d')
  expect(nextState.mapScene).toBe('3d')
  expect(nextState.selectedId).toBe('library')
  expect(nextState.routePlan).toBe(withSelection.routePlan)
})

it('normalizes unknown map scenes back to 2D', () => {
  const nextState = campusReducer(initialState, { type: 'SET_MAP_SCENE', scene: 'satellite' })

  expect(nextState.mapScene).toBe('2d')
})
```

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `npm test -- --run src/app/campusReducer.test.js`

Expected: 新增测试失败，因为初始状态没有 `mapScene`，reducer 也没有 `SET_MAP_SCENE` 分支。

- [ ] **Step 3: 实现最小 reducer 改动**

在 `createInitialState` 返回对象中加入：

```js
mapScene: '2d',
```

在 `campusReducer` 的 `SET_ROLE` 分支之前加入：

```js
case 'SET_MAP_SCENE':
  return { ...state, mapScene: action.scene === '3d' ? '3d' : '2d' }
```

- [ ] **Step 4: 运行 reducer 测试确认通过**

Run: `npm test -- --run src/app/campusReducer.test.js`

Expected: 13 个 reducer 测试通过，失败数为 0。

### Task 3: 加入场景投影领域函数

**Files:**
- Create: `src/domain/mapScene.js`
- Create: `src/domain/mapScene.test.js`
- Modify: `src/data/locations.js`
- Modify: `src/data/routeGraph.js`

- [ ] **Step 1: 为六个地点增加双场景坐标**

在每个地点对象中增加 `mapPosition`。第一版使用归一化 2D 坐标和现有可复用的 3D 路线坐标：

```js
mapPosition: {
  '2d': [0.52, 0.34],
  '3d': [0, 4, -518.4],
}
```

六个地点的第一版坐标表如下，数组顺序固定为 `[x, y]` 或 `[x, y, z]`：

| id | 2D 坐标 | 3D 坐标 |
| --- | --- | --- |
| `library` | `[0.52, 0.34]` | `[0, 4, -518.4]` |
| `teaching-a` | `[0.49, 0.49]` | `[201.6, 4, -321.6]` |
| `canteen` | `[0.31, 0.61]` | `[302.4, 4, -76.8]` |
| `dormitory` | `[0.19, 0.47]` | `[-206.4, 4, -76.8]` |
| `gymnasium` | `[0.70, 0.62]` | `[-336, 4, -187.2]` |
| `east-gate` | `[0.08, 0.79]` | `[0, 4, -33.6]` |

3D 坐标沿用对应入口节点坐标，后续校准只修改数据文件。

- [ ] **Step 2: 为路线节点增加 2D 坐标**

给 `src/data/routeGraph.js` 的每个节点增加 `mapPosition`，使路线可以覆盖官方平面图。使用以下节点坐标：

```js
const map2d = {
  'main-gate-entry': [0.08, 0.79],
  'axis-plaza': [0.20, 0.68],
  'axis-mound': [0.35, 0.55],
  'axis-hospital': [0.28, 0.45],
  'axis-library': [0.46, 0.40],
  'library-entry': [0.52, 0.34],
  'teaching-junction': [0.47, 0.49],
  'teaching-a-entry': [0.49, 0.49],
  'east-plaza': [0.56, 0.58],
  'canteen-junction': [0.28, 0.61],
  'canteen-entry': [0.31, 0.61],
  'dorm-junction': [0.17, 0.56],
  'dorm-west-entry': [0.19, 0.47],
  'gym-junction': [0.63, 0.60],
  'gymnasium-entry': [0.70, 0.62],
}
```

节点创建后使用 `mapPosition: { '2d': map2d[id], '3d': position }`，保留原有 `position` 字段，避免破坏当前路线测试。

- [ ] **Step 3: 写投影函数测试**

创建 `src/domain/mapScene.test.js`：

```js
import { describe, expect, it } from 'vitest'
import { getLocationMapPosition, getRouteMapPoints, isMapScene } from './mapScene.js'
import { locationRepository } from '../data/locations.js'
import { campusRouteGraph } from '../data/routeGraph.js'

describe('map scene helpers', () => {
  it('accepts only supported scenes', () => {
    expect(isMapScene('2d')).toBe(true)
    expect(isMapScene('3d')).toBe(true)
    expect(isMapScene('satellite')).toBe(false)
  })

  it('reads a location position for each scene', () => {
    const library = locationRepository.loadAll().find((location) => location.id === 'library')

    expect(getLocationMapPosition(library, '2d')).toEqual([0.52, 0.34])
    expect(getLocationMapPosition(library, '3d')).toEqual([0, 4, -518.4])
  })

  it('projects route node ids to 2D points', () => {
    const points = getRouteMapPoints({ nodeIds: ['main-gate-entry', 'axis-plaza', 'library-entry'] }, '2d')

    expect(points).toEqual([[0.08, 0.79], [0.20, 0.68], [0.52, 0.34]])
  })

  it('omits a route when a node has no coordinates', () => {
    const original = campusRouteGraph.nodes['axis-plaza'].mapPosition
    campusRouteGraph.nodes['axis-plaza'].mapPosition = { '3d': [0, 4, -129.6] }

    expect(getRouteMapPoints({ nodeIds: ['main-gate-entry', 'axis-plaza'] }, '2d')).toBeNull()

    campusRouteGraph.nodes['axis-plaza'].mapPosition = original
  })
})
```

- [ ] **Step 4: 实现 `src/domain/mapScene.js`**

实现以下纯函数：

```js
import { campusRouteGraph } from '../data/routeGraph.js'

export const MAP_SCENES = Object.freeze({ TWO_D: '2d', THREE_D: '3d' })

export function isMapScene(scene) {
  return scene === MAP_SCENES.TWO_D || scene === MAP_SCENES.THREE_D
}

export function getLocationMapPosition(location, scene) {
  return location?.mapPosition?.[scene] ?? null
}

export function getRouteMapPoints(routePlan, scene) {
  if (!routePlan?.nodeIds?.length) return null
  const points = routePlan.nodeIds.map((nodeId) => campusRouteGraph.nodes[nodeId]?.mapPosition?.[scene] ?? null)
  return points.every(Boolean) ? points : null
}
```

返回 3D 点时保持三元素数组，返回 2D 点时保持二元素数组；没有完整坐标时返回 `null`，调用方不得绘制路线。

- [ ] **Step 5: 运行领域测试**

Run: `npm test -- --run src/domain/mapScene.test.js src/data/routeGraph.test.js`

Expected: 所有地图投影和原有路线图测试通过。若测试需要修改冻结对象，使用可变测试夹具，不改变生产数据对象的冻结策略。

### Task 4: 实现左上角场景切换和 App 状态连接

**Files:**
- Create: `src/features/map/MapSceneSwitcher.jsx`
- Modify: `src/App.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 创建可访问的切换控件**

`MapSceneSwitcher.jsx` 使用 `role="tablist"`，每个按钮使用 `role="tab"`、`aria-selected` 和 `data-scene`：

```jsx
export function MapSceneSwitcher({ scene, onChange }) {
  return (
    <div className="map-scene-switcher" role="tablist" aria-label="地图场景">
      {[
        ['2d', '2D 平面图'],
        ['3d', '3D 模型'],
      ].map(([value, label]) => (
        <button
          className={scene === value ? 'is-active' : ''}
          key={value}
          type="button"
          role="tab"
          aria-selected={scene === value}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 将 `mapScene` 从 App 传到 MapWorkspace**

在 `App.jsx` 的 `MapWorkspace` props 中加入：

```jsx
mapScene={state.mapScene}
onMapSceneChange={(scene) => dispatch({ type: 'SET_MAP_SCENE', scene })}
```

在 `MapWorkspace` 参数中接收这两个 props，并在地图内容的左上角渲染 `MapSceneSwitcher`。

- [ ] **Step 3: 添加场景切换样式**

加入以下基础样式，位置与搜索框错开：

```css
.map-scene-switcher { position:absolute; z-index:18; top:100px; left:clamp(24px,4vw,62px); display:flex; gap:4px; padding:4px; border:1px solid rgba(32,61,53,.16); border-radius:10px; background:rgba(255,250,240,.92); box-shadow:0 10px 22px rgba(74,78,54,.12); }
.map-scene-switcher button { padding:8px 11px; border:0; border-radius:7px; color:var(--muted); background:transparent; font-size:11px; font-weight:700; }
.map-scene-switcher button.is-active { color:var(--paper-hi); background:var(--green); }
```

- [ ] **Step 4: 运行 reducer 测试和构建检查入口连接**

Run: `npm test -- --run src/app/campusReducer.test.js`

Expected: reducer 测试全部通过；组件尚未完成时允许构建暂时失败，下一任务补齐渲染器后再做完整构建。

### Task 5: 实现 2D 官方平面图渲染器

**Files:**
- Create: `src/features/map/Campus2DViewer.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 创建 2D 地图组件**

组件职责限定为底图和交互图层，接收 `mapUrl`、`locations`、`visibleLocationIds`、`selectedId`、`currentLocationId`、`routePlan` 和 `onSelectLocation`。地点标记使用 `getLocationMapPosition(location, '2d')`，样式位置通过百分比设置：

```jsx
const positionStyle = ([x, y]) => ({ left: `${x * 100}%`, top: `${y * 100}%` })
```

路线使用 `getRouteMapPoints(routePlan, '2d')`，用 SVG `polyline` 绘制；返回 `null` 时显示 `.campus-2d-state`，文本为“该场景暂未完成路线校准”。

- [ ] **Step 2: 加入 2D 加载和错误状态**

图片加载前显示“2D 平面图加载中…”，`onError` 后显示“2D 底图加载失败，请切换到 3D 或重试”。保留一个重试按钮，通过递增 `imageKey` 重新加载图片。

- [ ] **Step 3: 在 MapWorkspace 中按场景选择组件**

使用：

```jsx
{mapScene === '2d' ? (
  <Campus2DViewer
    mapUrl={teamCampusMap.scenes['2d'].imageUrl}
    locations={locations}
    visibleLocationIds={visibleIds}
    selectedId={selectedId}
    currentLocationId={currentLocationId}
    routePlan={routePlan}
    onSelectLocation={onSelectLocation}
  />
) : (
  <Campus3DViewer ... />
)}
```

通用 `CampusStatusOverlay`、`MapToolbar`、`HotspotLegend`、搜索框和来源说明继续只渲染一份。

- [ ] **Step 4: 运行 2D 组件相关测试和构建**

Run: `npm test -- --run src/domain/mapScene.test.js src/app/campusReducer.test.js && npm run build`

Expected: 测试通过，Vite 构建退出码为 0。

### Task 6: 将 3D 场景接入新 GLB 并处理模型点位降级

**Files:**
- Modify: `src/features/map/Campus3DViewer.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/features/map/campus3d.js`

- [ ] **Step 1: 使用双场景配置中的 3D 模型 URL**

将 `MapWorkspace` 的 3D 分支改为传入：

```jsx
modelUrl={teamCampusMap.scenes['3d'].modelUrl}
```

来源说明改为根据 `mapScene` 显示对应场景的来源标签和链接。

- [ ] **Step 2: 为没有 `modelAnchorId` 的地点增加元数据位置回退**

在 `campus3d.js` 增加：

```js
export function collectModelAnchors(model, locations) {
  const anchors = new Map()
  locations.forEach((location) => {
    const object = location.modelAnchorId ? model.getObjectByName(location.modelAnchorId) : null
    if (object) anchors.set(location.id, object)
  })
  return anchors
}

export function createMetadataAnchor(location) {
  const position = location?.mapPosition?.['3d']
  if (!position) return null
  const anchor = new THREE.Object3D()
  anchor.position.set(...position)
  return anchor
}
```

在模型加载后先使用真实模型锚点，再为缺少锚点的地点使用元数据锚点；如果没有坐标，继续加入缺失列表，不绘制标签。

- [ ] **Step 3: 保留旧 GLB 文件作为可回退资源**

不要删除 `public/assets/campus.glb`。如果新模型加载失败，错误面板提供“切回 2D”按钮，不自动静默切回旧模型，避免用户误以为看到的是本校区模型。

- [ ] **Step 4: 验证新 GLB 可被应用加载**

Run: `npm run build`

Expected: Vite 构建成功，并在构建产物中存在 `campus-extracted.glb` 的静态资源引用。

### Task 7: 完善响应式样式和地图文案

**Files:**
- Modify: `src/styles.css`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: 加入 2D 图层样式**

添加 `.campus-2d-viewer`、`.campus-2d-image`、`.campus-2d-overlay`、`.campus-2d-marker`、`.campus-2d-route` 和 `.campus-2d-state`。2D 图层必须占满地图表面，图片保持比例，标记层使用 `pointer-events:none`，单个标记恢复 `pointer-events:auto`。

- [ ] **Step 2: 增加移动端切换控件布局**

在现有移动端媒体查询中将 `.map-scene-switcher` 的 `top` 调整为 `116px`，`left` 调整为 `18px`，按钮保证最小高度 36px；2D 地图支持触摸拖拽时不阻止地点按钮点击。

- [ ] **Step 3: 更新页面文案**

把 `App.jsx` 顶部状态从“本地 GLB 地图”改为“2D / 3D 双场景地图”，把 `MapWorkspace` 的 aria-label 改为“本校区校园地图工作区”，并根据当前场景显示“官方平面图”或“3D 校园模型”。

### Task 8: 完整验证

**Files:**
- Verify: `src/**/*.test.js`
- Verify: `dist/`

- [ ] **Step 1: 运行完整测试**

Run: `npm test -- --run`

Expected: 所有测试通过，失败数为 0。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: Vite 退出码为 0，`dist/assets` 中同时出现 2D JPEG 和 3D GLB 资源。

- [ ] **Step 3: 启动本地演示并人工验收**

Run: `npm run dev -- --host 127.0.0.1`

验收清单：

1. 首屏显示 2D 本校区平面图；
2. 左上角可以切换到 3D；
3. 切换后搜索关键字、选中地点、路线、模拟位置和管理员状态不丢失；
4. 点击图书馆等标记可以打开现有详情面板；
5. 2D 路线有起点、终点和折线；
6. 3D 模型加载失败时仍可以切回 2D；
7. 浏览器宽度缩小时切换控件和路线面板仍可操作。

- [ ] **Step 4: 检查工作区变更范围**

Run: `git status --short`。

Expected: 当前目录没有 Git 元数据时明确记录“无法使用 Git 状态检查”；否则只确认变更集中在本计划列出的资源、数据、组件、样式和测试文件。
