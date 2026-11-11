# Tencent Campus Map Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show Tencent's 2D map for Campus Taigu Campus in the current phone preview, while retaining the campus map fallback and local campus-specific routing.

**Architecture:** Load JS API GL from the Tencent CDN using a local Vite environment key. Transform the existing normalized campus markers with a five-anchor GCJ-02 calibration, then render labels and routes as Tencent map overlays. Call WebService walking directions only for the ordinary shortest mode; preserve the existing local route for campus-specific constraints and on any service failure.

**Tech Stack:** React 19, Vite, Tencent Maps JavaScript API GL, Tencent WebService API.

---

## Files

- Create `src/data/tencentCampusGeo.js` for the image-to-GCJ-02 calibration and map center.
- Create `src/data/tencentMapApi.js` for script loading, JSONP route calls, error normalization, and route polyline decoding.
- Create `src/features/map/TencentCampusMap.jsx` for the Tencent map, place markers, labels, and route overlays.
- Modify `src/features/map/MapWorkspace.jsx` to select Tencent when the local key exists and offer a local-map fallback.
- Modify `src/styles.css` for the map canvas, loading/error message, and provider switch.
- Create `.env.example` with the key variable name only; keep the supplied value only in ignored `.env.local`.

## Task 1: Add GCJ-02 position conversion

**Files:** Create `src/data/tencentCampusGeo.js`.

- [ ] Store five campus control points matched to Tencent POIs: west gate `(279,410) → (37.424548,112.578701)`, archway `(428,420) → (37.424444,112.579655)`, Chongxue Building `(916,354) → (37.425144,112.583579)`, main teaching building `(1210,465) → (37.423786,112.585820)`, and laboratory building `(610,390) → (37.424905,112.581233)`.
- [ ] Fit and export the affine transform `lng=0.000007751548461*x-0.0000006366223844*y+112.5767195`, `lat=-0.0000001422525562*x-0.00001222785281*y+37.42964987`.
- [ ] Convert each location's normalized cropped-map position back to source-image pixels before applying the transform; return `null` for missing or non-finite positions.
- [ ] Export map center `(37.423038,112.583703)` and default zoom `15`.

## Task 2: Add Tencent API helpers

**Files:** Create `src/data/tencentMapApi.js`.

- [ ] Load `https://map.qq.com/api/gljs?v=1.exp&key=...` once per page, resolve only when `window.TMap` exists, and reject on script load failure.
- [ ] Implement a JSONP wrapper for `https://apis.map.qq.com/ws/direction/v1/walking/` with `from`, `to`, `key`, `output=jsonp`, and a unique callback; clear callback, timer, and script on completion/error/timeout.
- [ ] Decode Tencent's differential polyline array, where the first pair is decimal latitude/longitude and remaining values are coordinate deltas divided by `1e6`.
- [ ] Never log or return the Key in helper errors.

## Task 3: Render the Tencent map and campus overlays

**Files:** Create `src/features/map/TencentCampusMap.jsx`; modify `src/features/map/MapWorkspace.jsx` and `src/styles.css`.

- [ ] Create a flat top-down `TMap.Map` in `viewMode: '3D'` with `pitch: 0` centered on Taigu Campus; this keeps the display 2D-looking while preserving Tencent's rotation gestures.
- [ ] Render one marker and label for each current location that has a valid converted position; clicking a marker selects that location.
- [ ] Recenter on a selected/current location and rebuild overlay data when filters, labels, selected location, or events change.
- [ ] For a valid ordinary shortest route, request Tencent walking directions and display the decoded path as a `MultiPolyline`; do not request again for an unchanged endpoint pair during this page session.
- [ ] Keep the current campus route for the special campus modes. If Tencent walking directions fail, show a short fallback notice and do not draw a fabricated Tencent line.
- [ ] Display a source control to switch to the original campus guide; if the Key is absent or SDK initialization fails, show the existing campus guide and a small reason label.

## Task 4: Store the local key and inspect the mobile preview

**Files:** Create `.env.example`; `.env.local` remains ignored and untracked.

- [ ] Add only `VITE_TENCENT_MAP_KEY=` to `.env.example`.
- [ ] Confirm `.env.local` is ignored without printing its value.
- [ ] Restart Vite so the environment key is loaded, open the existing `http://localhost:5173/` preview, and inspect the Tencent map, POI labels, provider fallback, and marker selection at phone width.
- [ ] Check one route after the route quota is available; if the quota rejects it, confirm the local fallback message and preserve the previous campus route behavior.
