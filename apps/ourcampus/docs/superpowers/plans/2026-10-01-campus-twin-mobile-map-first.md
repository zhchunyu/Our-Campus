# CampusTwin Mobile Map-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the existing CampusTwin mobile web layout into a map-first, four-tab phone experience and show it in a live 390×840 browser preview.

**Architecture:** Keep the current map and global campus reducer as the shared base. Add mobile-only tab navigation and panels for Explore, Trips, and Me; reuse current map, search, location, route, role, and settings components. Keep desktop layout unchanged and use CSS media queries for the mobile shell.

**Tech Stack:** React 19, Vite, CSS, lucide-react.

---

## Files

- Create `src/features/mobile/MobileTabBar.jsx` for the four bottom navigation actions.
- Create `src/features/mobile/ExplorePanel.jsx` for campus location and hotspot discovery.
- Create `src/features/mobile/TripPanel.jsx` for route endpoint selection and existing route controls.
- Create `src/features/mobile/MePanel.jsx` for role, preferences, and manager demo tools.
- Modify `src/App.jsx` to hold active tab state, keep map state shared, and connect panels to existing reducer actions.
- Modify `src/features/map/MapWorkspace.jsx` to add map category shortcuts while retaining current map layers and controls.
- Modify `src/styles.css` for mobile full-screen geometry, floating controls, panels, and bottom safe-area navigation.
- Modify `index.html` to enable viewport safe-area insets with `viewport-fit=cover`.

## Task 1: Add mobile navigation and shared panel shell

**Files:** create `src/features/mobile/MobileTabBar.jsx`; modify `src/App.jsx` and `src/styles.css`.

- [ ] Create four accessible tab buttons: 首页, 探索, 行程, 我的. Props are `activeTab` and `onChange`; each button uses a stable tab id and `aria-current`/`aria-pressed` state.
- [ ] Add `const [activeTab, setActiveTab] = useState('map')` to `App`; keep the existing map rendered and pass the active tab to a mobile overlay panel so tab changes do not discard map camera state.
- [ ] Give the workspace an `activeTab` class. Render `LocationDetail` only on the map tab; render the shared `RouteDock` on desktop and on the map tab, while `TripPanel` renders it when the Trips tab is active.
- [ ] Hide the existing top bar only below the mobile breakpoint; show the bottom tab bar only there. Keep desktop DOM layout and current behavior intact.
- [ ] Add `viewport-fit=cover` to the viewport meta element so CSS safe-area inset values are available on phones.
- [ ] Add the mobile panel layer above the map and below the bottom tab bar. Use `100dvh`, `viewport-fit=cover` safe-area padding, and independent panel scrolling.

## Task 2: Build Explore, Trips, and Me panels from existing functions

**Files:** create `ExplorePanel.jsx`, `TripPanel.jsx`, and `MePanel.jsx`; modify `App.jsx` to connect callbacks.

- [ ] `ExplorePanel` composes existing `LocationFilters` and `LocationList`, accepts filtered locations, `query`, `category`, and their change handlers, plus `onSelectLocation`. Include active hotspot titles and locations using existing event/location data. Selecting a location dispatches `SELECT_LOCATION` and returns to the map tab.
- [ ] `TripPanel` accepts locations, current simulated location, and `routePlan`. Keep endpoint choices in component state; initialize origin from `routePlan.originId`, then simulated location, then `east-gate`. On planning, dispatch `SET_ROUTE_DESTINATION` followed by `SET_ROUTE_ORIGIN`, then render the existing `RouteDock` with mode, endpoint, swap, instructions, and clear handlers.
- [ ] When “规划到这里” is clicked in `LocationDetail`, dispatch `PLAN_ROUTE`, clear the selected location, and switch to the Trips tab. If the Trips tab has no route yet, show origin and destination selectors with a disabled plan button until a destination is selected.
- [ ] `MePanel` composes existing `RoleSwitcher`, `SettingsPanel`, and manager-only `EventComposer`. Pass the current role/settings and existing dispatch callbacks; show the “本地演示数据” boundary in the panel.
- [ ] Keep tab selection as presentation state. Continue sending campus data mutations through `campusReducer`; do not add a second copy of location, route, role, or settings state.

## Task 3: Recompose the map for the reference layout

**Files:** modify `src/features/map/MapWorkspace.jsx` and `src/styles.css`.

- [ ] Add a horizontally scrollable category chip row from existing `CATEGORIES`/`CATEGORY_LABELS`; tapping a chip calls `onCategoryChange` and filters the map.
- [ ] At mobile widths, position the search capsule above the category row and the bottom navigation; hide the desktop category select when chips are visible.
- [ ] Make the map surface fill the available screen behind floating controls. Hide the secondary map toolbar on phones; keep the 2D/3D switch, compass, and zoom buttons reachable. Move layers, simulated location, and first-person mode into 我的 → 地图工具. Keep the full desktop toolbar above the mobile breakpoint.
- [ ] Render selected location details and route controls as mutually exclusive bottom sheets. Keep manager edit controls inside the selected detail or Me panel.
- [ ] Preserve the desktop CSS path at widths above 760px. Use the existing theme and map assets; use the reference image for layout hierarchy only.

## Task 4: Open and visually inspect the live preview

**Files:** no additional files.

- [ ] Start the existing Vite server from the `CampusTwin` directory with `npm run dev -- --host 0.0.0.0`.
- [ ] Open the local URL in Chrome responsive device view at 390×840 CSS pixels; keep Vite hot reload active while adjusting the layout.
- [ ] Inspect 360×800 and 430×932 portrait views for safe-area collisions, horizontal overflow, and panel scrolling. Click through all four tabs, search/select a location, switch 2D/3D, and create/change/clear a route.
- [ ] Open the same local app on desktop width and confirm the existing desktop map layout remains usable.

## User-request constraints

- Do not add or run automated tests for this request.
- Do not add live weather, traffic, voice search, real GPS, accounts, backend sync, or an installable mobile package.
- Do not publish or choose an HTTPS host in this implementation pass; leave the Vite preview running/open for the user to inspect.
