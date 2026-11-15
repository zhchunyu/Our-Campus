# Along Student System Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement the independent tasks, then perform a combined integration and visual review. Checkboxes track real completion.

**Goal:** Implement the selected “沿途” system throughout the existing OurCampus app and connect students' daily tasks.

**Architecture:** Keep the React/Capacitor application, server contracts, real Tencent map and existing data stores. Rework the home and shared visual system; connect curriculum, place, restaurant, chat and return context using existing IDs and callbacks. New public profile storage is not silently introduced.

**Tech Stack:** React 19, Vite, Lucide, Capacitor, Supabase clients, Vitest; existing Windows portable native toolchain.

**Selected source:** User explicitly selected the attached “OurCampus · 沿途” board on 2026-11-15, matching `docs/design/2026-11-15-student-daily/concepts/direction-2.png`. The global 26-group coverage specification applies. No additional style approval is required.

## 1 Shared system and daily home — root

- [x] Define navy/teal/yellow tokens, readable type and controls in `canvasTheme.css`; update `MobileTabBar.jsx` labels/icons and all primary page chrome.
- [x] Replace the decorative home in `CanvasHome.jsx` with search, real campus map preview, actual next scheduled class/import state and recent/saved places. Reuse live map runtime for interactive map; never ship generated map geography or fixed sample courses.
- [x] Add meaningful home data tests before the new behavior. Preserve owner isolation and explicit unknown dates.
- [x] Generate one botanical default cover matching the selected source; preserve every user's custom cover and real restaurant imagery.

## 2 Campus and course chain — independent implementation

- [x] Rework `ExplorePanel.jsx` and `NearbyFacilitiesPanel.jsx` into the Campus surface with direct food/window/review actions.
- [x] Connect timetable course rooms to building selection without guessing an exact room; add `locations`/`onSelectLocation` optional contract through `TimetablePage.jsx` and `TimetableDayView.jsx`.
- [x] Replace misleading fixed back labels. Keep XLS import, calibration, conflicts, local scope and account separation.
- [x] Apply the same design to AI, services, activity, feedback, location and route shells through `inner-canvas.css`. Preserve focus, keyboard, file inputs and reduced motion.
- [x] Test reliable building match, ambiguous/unmatched rooms and direct restaurant association.

## 3 Community and messages — independent implementation

- [x] Rework community content and chat in `HallPanel.jsx`, `community-canvas.css` and notification styles to match the selected design. Retain lost/found and the game's real drawing colors and logic.
- [x] Follow the selected district for sending; explicitly choose a district when reading All.
- [x] Support an optional original-message target with stable highlights/return state; do not claim an unloaded or withdrawn message exists.
- [x] Preserve photo uploads, retract, permissions, account boundaries, composition and small keyboard viewports; add targeted behavior tests.

## 4 Personal, visitors and restaurants — independent implementation

- [x] Apply selected botanical/navy/teal treatment across `personal-canvas.css`, `PersonalHome.jsx`, visitor page and `restaurant-student-canvas.css`.
- [x] Explicit public avatar/name and private tools; custom cover remains local unless a separate backend change is implemented and approved.
- [x] Restyle restaurant list/detail/menu/ratings/photo composer without changing photo RPC/storage contracts or fake ratings.
- [x] Add optional `onPlanRouteToLocation` connection to restaurant detail so food can lead straight to a truthful route.

## 5 Root integration and honest route origins

- [x] Wire new callbacks only in `App.jsx` after agreed contracts; unify home/dynamic/dining/notification destinations and preserve source context.
- [x] Require origin confirmation before planning from an unconfirmed preset; offer current position or an explicitly selected campus start. Real device location and campus route estimates remain distinguished.
- [x] Make cloud report completion return to the matching cloud records; keep local simulation clearly separate.
- [x] Verify all 26 page groups share the selected design and no old green-card layer resurfaces in nested pages.

## 6 Verification and delivery

- [x] Run targeted behavior tests and the full suite once; compare the existing eight map failures and one Node alias failure with known baseline.
- [x] Build production web, sync Capacitor and compile native Java without inventing a replacement Android signing key.
- [x] Browser-check actual home→class→place→route, campus→restaurant→review, community→chat→author→back, report records and login/setting sheets at 390px and 320px.
- [x] Compare the selected source and actual captures together, fix blocking design differences and write `design-qa.md` with the remaining truthful limits.
- [x] Commit, push and publish only verified artifacts; preserve prior releases and teammate code. No new APK without the original release signing identity.

## Validation record

See docs/releases/2026-11-15-along-system-preview.md and pps/ourcampus/design-qa.md for actual checks and limits. The original browser checklist describes the intended range; cloud uploads, admin operations and device permissions were not exercised against live accounts. Publishing follows these local verification gates.
