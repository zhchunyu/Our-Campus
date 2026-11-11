# 共享仓库唯一事实源接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CampusTwin 的地图资产、空间坐标、道路、地点和热点事件统一到共享仓库当前 `main` 版本。

**Architecture:** 资源文件由 `public/assets` 提供，`campusMap.js` 保存仓库版本元数据；仓库坐标和路网进入独立 data adapter，React 的领域层继续负责路线模式、管理员状态和持久化。2D/3D 组件只消费统一地点、路线和事件状态。

**Tech Stack:** React 19, Vite, Three.js, GLB/Draco, Vitest, Git blob 读取。

---

### Task 1: 固化仓库资源和版本元数据

**Files:**
- Modify: `src/data/campusMap.js`
- Modify: `public/assets/campus.glb`
- Modify: `public/assets/shanhe-campus-plan.svg`
- Test: `src/data/campusMap.test.js`

- [x] **Step 1:** 写资源元数据测试，断言版本提交、GLB 字节数、`Z_TOP`、SVG 原点和 2D/3D 路径都来自共享仓库配置。
- [x] **Step 2:** 用仓库当前 `site/assets/campus.glb` 替换本地模型，同时保留 Draco 解码器路径不变。
- [x] **Step 3:** 更新地图配置为共享仓库 `main@7a3e0d7`，默认场景保持 3D，模型大小改为 5.7 MB。
- [x] **Step 4:** 运行 `npm test -- --run`，确认资源元数据测试通过。

### Task 2: 统一地点、别名和仓库锚点

**Files:**
- Create: `src/data/sharedRepoBuildings.js`
- Modify: `src/data/locations.js`
- Modify: `src/data/sharedCampus.js`
- Modify: `src/domain/campus.js`
- Test: `src/data/locations.test.js`

- [x] **Step 1:** 为仓库标准地点建立稳定 ID、别名、入口方向和区域分类。
- [x] **Step 2:** 将现有简化地点改为仓库标准名称的兼容别名，不再保留与模型不一致的手工坐标。
- [x] **Step 3:** 使用仓库 SVG→世界坐标规则生成 2D/3D 位置，管理员持久化只保存状态字段。
- [x] **Step 4:** 增加图书馆、食堂、体育馆、教学楼和主校门的别名测试。

### Task 3: 对齐道路和路线接驳

**Files:**
- Modify: `src/data/roadNetwork.js`
- Modify: `src/data/routeGraph.js`
- Modify: `src/data/events.js`
- Test: `src/data/routeGraph.test.js`
- Test: `src/app/campusReducer.test.js`

- [x] **Step 1:** 对照仓库 `navigation.campus.js` 校验 97 个节点和 110 条边的数量、方向和关键节点名称。
- [x] **Step 2:** 将地点入口接驳到仓库道路节点，接驳点使用建筑入口方向而不是建筑中心。
- [x] **Step 3:** 将施工事件的 `affectedEdgeIds` 改为仓库道路边 ID，验证阻断后 A* 绕行或返回不可达。
- [x] **Step 4:** 增加主校门→图书馆、主校门→食堂、主校门→教学区的路线断言。

### Task 4: 对齐 2D/3D 展示和事件状态

**Files:**
- Modify: `src/features/map/MapWorkspace.jsx`

- [x] **Step 1:** 让 2D/3D 路线、标签和热点只读取统一领域坐标。
- [x] **Step 2:** 在资源来源面板显示仓库提交、模型大小和坐标基准。
- [x] **Step 3:** 复用现有模型加载失败回退与共享状态逻辑。
- [x] **Step 4:** 在浏览器中验证 3D 主视角、2D 总览和图书馆路线。

### Task 5: 回归验证

**Files:**
- Modify: `docs/superpowers/specs/2026-09-26-repository-source-of-truth-design.md`

- [x] **Step 1:** 运行 `npm test -- --run`，要求所有测试通过。
- [x] **Step 2:** 运行 `npm run build`，确认只保留可接受的 chunk 大小警告。
- [x] **Step 3:** 检查本地 GLB 字节数和仓库字节数一致。
- [x] **Step 4:** 在本地演示中验证路线、标签、刷新持久化和 2D/3D 切换。
