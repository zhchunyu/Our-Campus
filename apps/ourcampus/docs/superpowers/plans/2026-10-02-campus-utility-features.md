# 校园实用功能 Implementation Plan

> **For agentic workers:** This plan is being executed inline in the current task. Each task is a vertical slice and shares the existing local prototype state.

**Goal:** Deliver an official-source campus service directory, date-filtered activity list, local facility reports, persistent favorites/routes, and a data-gated indoor navigation entry.

**Architecture:** Reuse the existing location, event, feedback, reducer, and localStorage models. Add focused directory/calendar/report UI modules, migrate persisted user state, and leave indoor pathfinding unavailable until floor plans and indoor edges are supplied.

**Tech Stack:** React, Vite, existing reducer/localStorage, lucide-react.

---

### Task 1: Add campus service directory

**Files:**
- Create: `src/data/campusServices.js`
- Create or modify: `src/features/mobile/CampusServiceDirectory.jsx`
- Modify: `src/features/mobile/ExplorePanel.jsx`
- Modify: `src/features/locations/LocationDetail.jsx`
- Modify: `src/styles.css`

- [x] Add records for library, canteen, clinic, and the online one-stop service hall. Store only official verified values; represent missing opening hours as unavailable.
- [x] Render service descriptions, official source links, telephone links, and location actions where a location ID exists.
- [x] Search directory records using the existing Explore search field; physical services expose a direct route button.

### Task 2: Add date-filtered campus activity calendar

**Files:**
- Create: `src/features/mobile/CampusEventCalendar.jsx`
- Modify: `src/features/mobile/ExplorePanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [x] Filter existing non-closed activity events by selected local date and hide events that have ended.
- [x] Show event date, time, category/title and place; wire place selection and route actions to current handlers.

### Task 3: Add local facility reports

**Files:**
- Modify: `src/domain/placeFeedback.js`
- Modify: `src/features/locations/PlaceFeedbackSheet.jsx`
- Create: `src/features/mobile/FacilityReportsPanel.jsx`
- Modify: `src/app/campusReducer.js`
- Modify: `src/data/appStorage.js`
- Modify: `src/features/mobile/MePanel.jsx`
- Modify: `src/styles.css`

- [x] Add repair categories for lights, water dispensers, elevators and other facilities.
- [x] Persist report status as pending, processing or completed; allow only manager-demo state transitions.
- [x] Show the visitor's locally stored reports and the manager's report queue.

### Task 4: Add persistent favorites and saved routes

**Files:**
- Modify: `src/app/campusReducer.js`
- Modify: `src/data/appStorage.js`
- Modify: `src/features/locations/LocationDetail.jsx`
- Modify: `src/features/routes/RouteDock.jsx`
- Modify: `src/features/mobile/MePanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [x] Add schema migration fields for favorite location IDs and saved route records.
- [x] Add location and route save actions, duplicate prevention, and remove actions.
- [x] Show saved items in “我的”; route cards re-dispatch normal campus route planning.

### Task 5: Add indoor-navigation data gate

**Files:**
- Modify: `src/features/mobile/ExplorePanel.jsx`
- Create: `src/features/mobile/IndoorNavigationNotice.jsx`
- Modify: `src/styles.css`

- [x] Show indoor navigation as unavailable until a building has verified floor-plan and indoor-routing data.
- [x] Link to the official campus GIS source; never fabricate floor maps or indoor route lines.

### Task 6: Verify build and preview

**Files:** None.

- [x] Run `npm run build` from the project root.
- [ ] Inspect the feature sections in the existing mobile preview.
