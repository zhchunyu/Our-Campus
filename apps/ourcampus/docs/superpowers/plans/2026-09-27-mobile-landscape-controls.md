# 手机横屏与工具栏布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机可通过一次点击尝试进入全屏横屏，且横屏地图、工具栏、路线与地点详情面板使用互不挤压的布局区域。

**Architecture:** 新增一个独立的横屏控制组件，负责识别窄屏触控设备、请求全屏/横屏锁、显示手动旋转提示并提供退出操作。横屏样式用 CSS Grid 为工具栏和地图分配列，为控制行、地图和路线/详情面板分配行；桌面与原竖屏样式保持原路径。

**Tech Stack:** React 19、CSS Grid、Screen Orientation API、Fullscreen API、Vite。

**当前状态：** 用户决定先恢复竖屏默认体验。横屏实现保存在 `MobileLandscapeController.jsx` 与 `mobileLandscape.css`；组件未挂载、样式未导入，因此当前不会改变页面方向或横屏布局。后续要重新启用时，再把组件挂回 `App.jsx` 并导入样式。

---

### Task 1: 横屏进入与退出控制

**Files:**
- Create: `src/features/map/MobileLandscapeController.jsx`
- Modify: `src/App.jsx`
- Modify: `index.html`

- [x] **Step 1: 加入方向与全屏状态控制组件**

在新组件中读取屏幕宽高和触控能力，目标设备条件为：触控设备且较短边不大于 760 CSS px。用 `resize`、`orientationchange`、`screen.orientation.change` 和 `fullscreenchange` 更新状态。竖屏下渲染一个全屏入口层；横屏全屏时渲染一个退出按钮；桌面端返回 `null`。

```jsx
const isPhoneViewport = () => (
  (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  && Math.min(window.innerWidth, window.innerHeight) <= 760
)

const isPortraitViewport = () => window.innerHeight > window.innerWidth
```

- [x] **Step 2: 实现点击进入和回退路径**

点击入口时，先尝试 `document.querySelector('.app-shell')?.requestFullscreen()`，再尝试 `screen.orientation.lock('landscape')`。每一步用 `try/catch` 捕获拒绝；不支持或失败时显示“请将手机旋转至横屏”，方向变化后自动移除入口层。退出操作调用 `screen.orientation.unlock()`，随后在 `document.fullscreenElement` 存在时调用 `document.exitFullscreen()`。

- [x] **Step 3: 将控制组件和安全区视口接入页面**

在 `App.jsx` 的 `.app-shell` 根节点内挂载控制组件。将 `index.html` 的 viewport 元信息改为：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

### Task 2: 横屏地图与工具栏非覆盖布局

**Files:**
- Modify: `src/styles.css`
- Modify: `src/features/map/MapWorkspace.jsx` only if grid placement cannot be expressed safely against its current direct children.

- [x] **Step 1: 为全屏横屏分配动态视口和工作区行**

在现有媒体查询后增加 `(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)` 规则。将应用设为 `100dvh` 高、禁止页面滚动；压缩顶部栏；`.workspace` 使用 `minmax(0, 1fr) auto auto` 三行，使地图工作区、地点详情和路线栏各有自己的行。

- [x] **Step 2: 使用地图工具栏列与地图区列**

将 `.map-workspace` 设为 `auto minmax(0, 1fr)` 两列与 `46px minmax(0, 1fr)` 两行的网格。工具栏占第一列并跨两行；搜索占地图区第一行左侧，2D/3D 场景切换占同一行右侧；校园状态和图例在小高度横屏下收起；地图面占地图区第二行。

```css
.map-workspace {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 46px minmax(0, 1fr);
  min-height: 0;
}

.map-toolbar { grid-column: 1; grid-row: 1 / 3; position: relative; }
.map-search-overlay { grid-column: 2; grid-row: 1; position: relative; }
.map-scene-switcher { grid-column: 2; grid-row: 1; position: relative; justify-self: end; }
.map-surface { grid-column: 2; grid-row: 2; min-height: 0; }
```

- [x] **Step 3: 让工具栏展开和底部面板占用真实空间**

折叠工具栏设为约 52px，展开工具栏设为约 206px，使用自动第一列宽度推动地图区缩窄；面板本身设置最大高度和内部滚动。路线栏与地点详情设为普通网格项，不再使用绝对定位覆盖地图。路线栏保持单行横向滚动，起终点、指引、模式、时长和清除入口均可触达。

- [x] **Step 4: 处理横屏安全区与地图角落控件**

在网格内侧使用 `env(safe-area-inset-*)`；收起地图来源说明和罗盘；把 3D 地图控制按钮限制在地图视口右侧，底部提示在短高度下隐藏，避免压住路线栏。

### Task 3: 构建和实机尺寸检查

**Files:**
- Review: `src/features/map/MobileLandscapeController.jsx`
- Review: `src/App.jsx`
- Review: `src/styles.css`
- Review: `index.html`

- [x] **Step 1: 构建生产版本**

在 `CampusTwin` 根目录运行 `npm run build`。预期输出 Vite build 成功且退出码为 0。

- [x] **Step 2: 检查竖屏入口与横屏布局**

在浏览器中查看 390×844 竖屏、844×390 横屏和 932×430 横屏。竖屏应显示入口；横屏下应没有页面滚动、搜索/场景切换不碰撞，工具栏展开时地图变窄，路线栏或地点详情处于独立行。

- [x] **Step 3: 检查横屏能力失败的回退**

确认方向锁 API 不存在或拒绝时显示手动旋转提示；旋转至横屏后提示消失；退出按钮退出全屏并解除方向锁。
