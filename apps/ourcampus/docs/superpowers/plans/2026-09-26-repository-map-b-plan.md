# 共享仓库地图接入（B 方案）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CampusTwin 改造成“共享仓库山河大学地图 + 2D 主地图 + 3D 按需打开”，并让地点、路线、热点和管理员发布共用一套空间数据。

**Architecture:** 保留当前 React/Vite/Three.js 应用壳和本地数据源，通过 `campusMap`、地点适配器、路网适配器和事件投影层接入共享仓库资产。2D 首屏负责日常操作；3D 只在用户主动打开时加载 GLB；路线计算和事件状态放在领域层，两个地图场景只负责渲染。

**Tech Stack:** React, Vite, raw Three.js, Vitest, SVG/GLB, localStorage-backed local data source.

---

## Task 1: 建立共享地图资产清单和统一地图配置

**Files:**
- Create: `src/data/sharedCampus.js`
- Modify: `src/data/campusMap.js`
- Test: `src/data/campusMap.test.js`
- Asset: `public/assets/campus.glb`（确认使用共享仓库版本）
- Asset: `public/assets/shanhe-campus-plan.svg`（从共享仓库 `01-产品设计/山河大学_总平面格局图.svg` 导入）

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest'
import { teamCampusMap } from './campusMap.js'

describe('shared campus map configuration', () => {
  it('uses the repository campus identity and lazy 3D asset', () => {
    expect(teamCampusMap.campusName).toBe('山河大学 · 校园数字孪生')
    expect(teamCampusMap.defaultScene).toBe('3d')
    expect(teamCampusMap.scenes['2d'].imageUrl).toBe('/assets/shanhe-campus-plan.svg')
    expect(teamCampusMap.scenes['3d'].modelUrl).toBe('/assets/campus.glb')
  })

  it('exposes source and version metadata for both scenes', () => {
    expect(teamCampusMap.scenes['2d'].sourceLabel).toContain('共享仓库')
    expect(teamCampusMap.scenes['3d'].modelSource).toContain('共享仓库')
    expect(teamCampusMap.version).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/data/campusMap.test.js`

Expected: FAIL because the existing map configuration still points to the Campus image and extracted GLB.

- [ ] **Step 3: Add the shared map manifest**

Create `src/data/sharedCampus.js` with one source-of-truth object:

```js
export const SHARED_CAMPUS_VERSION = 'repo-main-2026-09-26'

export const sharedCampusSource = Object.freeze({
  id: 'shanhe-university',
  name: '山河大学',
  planAsset: '/assets/shanhe-campus-plan.svg',
  modelAsset: '/assets/campus.glb',
  sourceLabel: '共享仓库 Chun-Yu · 竞赛演示资产',
  coordinateSystem: 'three-x-east-y-up-z-south',
})
```

Update `src/data/campusMap.js` so both scenes read from this manifest, use the shared identity, and retain source/version metadata. Keep the old Campus asset entries only as a named legacy source, not as the active default.

- [ ] **Step 4: Add the two repository assets**

Confirm `public/assets/campus.glb` is the shared repository GLB by checking its size and loadability. Import the repository’s 2D plan as `public/assets/shanhe-campus-plan.svg`. Do not rename or delete the existing Campus assets; they remain available for a future adapter.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npm test -- --run src/data/campusMap.test.js`

Expected: PASS with all map identity and asset metadata assertions passing.

## Task 2: Replace the 2D main map while preserving zoom, drag, labels, and overlays

**Files:**
- Modify: `src/features/map/Campus2DViewer.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/data/mapLabels.js`
- Modify: `src/styles.css`
- Test: `src/features/map/Campus2DViewer.test.jsx` or the existing map test location

- [ ] **Step 1: Write the failing behavior tests**

Add tests that render the 2D viewer with the shared SVG asset and verify:

```js
expect(screen.getByRole('img', { name: /山河大学/ })).toHaveAttribute(
  'src',
  '/assets/shanhe-campus-plan.svg',
)
expect(screen.getByText('图书馆')).toBeVisible()
```

Add a test that a route overlay remains mounted when the map zoom/drag state changes.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/features/map/Campus2DViewer.test.jsx`

Expected: FAIL because the current viewer expects the old raster map metadata and old coordinate labels.

- [ ] **Step 3: Normalize 2D coordinates and labels**

Move active label positions to `location.mapPosition['2d']` normalized values. The viewer must derive pixel positions from the current rendered image dimensions instead of hard-coded screen coordinates. Preserve the existing pointer capture drag behavior, wheel zoom, reset view, route overlay, current-location marker, and hotspot layers.

- [ ] **Step 4: Update 2D visual metadata**

Show `山河大学 · 总平面图`, the repository source label, and the active map version in the existing source/footer treatment. Keep the current collapsible toolbar and map-first layout.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/features/map/Campus2DViewer.test.jsx src/domain/mapViewport.test.js`

Expected: PASS; zoom, pan, reset, labels, and overlays remain covered.

## Task 3: Make the shared 3D model lazy-loaded and recoverable

**Files:**
- Modify: `src/features/map/MapSceneSwitcher.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/features/map/Campus3DViewer.jsx`
- Modify: `src/data/campusMap.js`
- Test: `src/features/map/MapSceneSwitcher.test.jsx`

- [ ] **Step 1: Write failing scene-switch tests**

Cover these states:

```js
expect(screen.getByRole('tab', { name: /2D/ })).toHaveAttribute('aria-selected', 'true')
expect(screen.queryByText(/正在加载 3D/)).not.toBeInTheDocument()

await user.click(screen.getByRole('tab', { name: /3D/ }))
expect(screen.getByText(/正在加载/)).toBeVisible()
```

Add a failure-path test that calls the model error callback and expects a visible “返回 2D” action without losing the selected location or route.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/features/map/MapSceneSwitcher.test.jsx`

Expected: FAIL because the current scene switcher does not expose the explicit lazy-loading and fallback states required by B方案.

- [ ] **Step 3: Implement lazy loading**

Keep the initial render on 2D. Mount `Campus3DViewer` only after the user selects 3D. Pass the shared model URL from `teamCampusMap.scenes['3d']`, expose loading/error callbacks, and avoid clearing `selectedId`, `routePlan`, `currentLocationId`, or active event filters during a scene switch.

- [ ] **Step 4: Add 3D overlay guards**

Update `Campus3DViewer` so it renders the current route only when it has at least two 3D points, renders an arrived state as a marker/message rather than a line, and keeps location/event overlays independent of model loading completion. If anchors are missing, show a non-blocking warning and retain the 2D fallback.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/features/map/MapSceneSwitcher.test.jsx src/features/map/campus3d.test.js`

Expected: PASS with explicit loading, success, failure, fallback, and overlay-preservation coverage.

## Task 4: Adapt shared locations and road graph

**Files:**
- Create: `src/data/sharedLocations.js`
- Create: `src/data/sharedNavigation.js`
- Modify: `src/data/locations.js`
- Modify: `src/data/routeGraph.js`
- Modify: `src/domain/route.js`
- Test: `src/data/sharedNavigation.test.js`
- Test: `src/domain/route.test.js`

- [ ] **Step 1: Write failing adapter tests**

Test that the adapter exposes the shared campus core locations and the shared graph shape:

```js
expect(sharedLocations.some((item) => item.id === 'library')).toBe(true)
expect(sharedNavigation.nodes.length).toBeGreaterThanOrEqual(90)
expect(sharedNavigation.edges.length).toBeGreaterThanOrEqual(100)
expect(sharedNavigation.entryNodeByLocation.library).toBeTruthy()
```

Test that `blockedEdges` removes an edge from the graph used by route planning but does not mutate the immutable base graph.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- --run src/data/sharedNavigation.test.js src/domain/route.test.js`

Expected: FAIL because the local project still uses the previous Campus node set.

- [ ] **Step 3: Add shared location and navigation adapters**

Create an adapter boundary that normalizes repository data into the current application shape. Include core places used by the demo: main gate, library, teaching buildings, canteen, dormitory area, gym, activity area, and service points. Keep aliases and category IDs stable for search and filters.

Create `sharedNavigation.js` with immutable base nodes/edges, entry-node mappings, edge metadata (`accessible`, `covered`, `blocked`, `safety`), and a `buildNavigationGraph(blockedEdges)` function. Use the repository’s route semantics without importing its page-level globals.

- [ ] **Step 4: Make the route domain consume the adapter**

Update `routeGraph.js` and `route.js` so all route modes consume the shared adapter. Preserve the existing route result contract, including `preview`, `arrived`, and `unavailable`. Add a `blockedEdges` argument with an empty default so existing callers remain safe.

- [ ] **Step 5: Run route tests**

Run: `npm test -- --run src/data/sharedNavigation.test.js src/data/routeGraph.test.js src/domain/route.test.js`

Expected: PASS, including shortest route, same-origin arrival, blocked-edge detour, inaccessible route, and immutable base graph checks.

## Task 5: Connect admin events to hotspots and dynamic route constraints

**Files:**
- Modify: `src/data/events.js`
- Modify: `src/app/campusReducer.js`
- Modify: `src/data/campusDataSource.js`
- Modify: `src/features/events/EventComposer.jsx`
- Modify: `src/features/map/CampusStatusOverlay.jsx`
- Modify: `src/App.jsx`
- Test: `src/app/campusReducer.test.js`
- Test: `src/data/campusDataSource.test.js`

- [ ] **Step 1: Write failing reducer tests**

Cover:

```js
const next = reduce(state, publishEvent({
  type: 'traffic',
  locationId: 'canteen',
  affectedEdgeIds: ['outer_s2:outer_s3'],
  status: 'published',
}))
expect(next.blockedEdges).toContain('outer_s2:outer_s3')
expect(next.routePlan.distance).not.toBe(previous.routePlan.distance)
```

Also cover closing the event removing its edge from `blockedEdges`, and publishing an event updating both the map hotspot projection and the location detail projection.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- --run src/app/campusReducer.test.js src/data/campusDataSource.test.js`

Expected: FAIL because events currently update only local event lists and do not feed the route graph.

- [ ] **Step 3: Extend the event model**

Add `affectedEdgeIds`, `status`, `severity`, `source`, `credibility`, and `updatedAt` with safe defaults for existing demo events. Preserve administrator publishing, editing, closing, and local persistence.

- [ ] **Step 4: Add blocked-edge projection**

In the reducer/data source, derive the current blocked-edge set from published, non-expired events. Recompute the route through the route domain after an event changes. Keep the route explanation explicit: event name, blocked segment, detour distance/time change.

- [ ] **Step 5: Update the admin composer and map overlay**

Let the administrator choose an event location and optional affected road segment. Show the event’s type, status, source, and route impact in the existing detail/overlay UI. Do not add a second admin page; keep the map-first interaction.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run src/app/campusReducer.test.js src/data/campusDataSource.test.js src/features/routes/RouteDock.test.js`

Expected: PASS, including publish, close, persistence, hotspot projection, and route impact.

## Task 6: Add readonly/interactive demo mode and shared metadata

**Files:**
- Create: `src/data/demoMode.js`
- Modify: `src/App.jsx`
- Modify: `src/features/roles/RoleSwitcher.jsx`
- Modify: `src/features/map/SettingsPanel.jsx`
- Modify: `src/styles.css`
- Test: `src/data/demoMode.test.js`

- [ ] **Step 1: Write failing mode tests**

Test URL parsing:

```js
expect(readDemoMode('?mode=readonly')).toBe('readonly')
expect(readDemoMode('?mode=interactive')).toBe('interactive')
expect(readDemoMode('')).toBe('readonly')
```

Test that readonly hides the event publishing action while interactive keeps it available.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/data/demoMode.test.js`

Expected: FAIL because the current app has role switching but no URL-driven demonstration mode.

- [ ] **Step 3: Implement the mode boundary**

Parse `mode` once at app startup. Keep `readonly` as the safe default for the public demonstration, and enable administrator publishing only in `interactive`. Display the active mode and shared map version in the existing status/settings area.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/data/demoMode.test.js src/app/campusReducer.test.js`

Expected: PASS.

## Task 7: Full verification and user-facing smoke test

**Files:**
- Modify: `docs/superpowers/specs/2026-09-26-repository-map-b-design.md` only if implementation decisions materially change
- No new feature files

- [ ] **Step 1: Run the complete test suite**

Run: `npm test -- --run`

Expected: all test files pass with zero failures.

- [ ] **Step 2: Build the application**

Run: `npm run build`

Expected: exit code 0. A large-chunk warning may remain for the GLB path, but there must be no build errors.

- [ ] **Step 3: Run the browser smoke path**

Open `http://127.0.0.1:5173/` and verify in this order:

1. 2D 山河大学地图 appears without waiting for GLB;
2. search opens 图书馆 and the detail card uses the shared location ID;
3. route from main gate to library renders with distance/time;
4. publishing a blocking event changes the route result and displays the reason;
5. clicking “查看 3D” loads the shared GLB and preserves the selection/route;
6. returning to 2D preserves the same state;
7. forcing a 3D load error returns to usable 2D;
8. `?mode=readonly` hides publishing and `?mode=interactive` enables it.

- [ ] **Step 4: Report actual verification evidence**

Report the exact test count, build exit status, browser smoke results, and any remaining limitation. Do not claim the shared map is integrated until both the 2D asset and shared GLB have been verified in the running app.
