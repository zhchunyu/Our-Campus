# Android APK and Live Campus Location Plan

**Goal:** Package the existing campus app as an installable Android APK and add an on-demand live location control to the home map.

**Architecture:** Keep the React/Vite interface and wrap its built assets with Capacitor Android. Use the official Capacitor Geolocation plugin after the user taps the location button; convert the returned WGS-84 coordinates to Tencent GCJ-02 and render a blue location marker on the active campus map.

**Tech Stack:** React, Vite, Capacitor 8, Capacitor Geolocation, Tencent Maps JavaScript GL.

## Files and responsibilities

- `capacitor.config.ts`: Android application id, app name, and Vite output directory.
- `android/`: native Android project, manifest location permissions, and Gradle wrapper.
- `src/data/tencentCampusGeo.js`: coordinate conversion and inverse campus-plan calibration.
- `src/App.jsx`: one-shot permission and GPS state, kept only in memory.
- `src/features/map/MapWorkspace.jsx`: shared home-map locate action and status message.
- `src/features/map/Campus2DViewer.jsx`: local campus-plan marker and recenter behavior.
- `src/features/map/TencentCampusMap.jsx`: Tencent marker layer and recenter behavior.
- `src/styles.css`: location action, marker, and status styling.
- `package.json`: Android sync and debug-APK build commands.

## Tasks

### Task 1: Add Capacitor Android shell

- [x] Add matching Capacitor 8 core, CLI, Android, and Geolocation dependencies.
- [x] Configure Capacitor with the existing `dist` output and a stable Android application id.
- [x] Generate the Android platform project and add coarse/fine location permissions.
- [x] Add an `android:apk` command that builds web assets, syncs Capacitor, and runs `assembleDebug`.

### Task 2: Add on-demand live location

- [x] Add a home-map button that requests permission only after a tap.
- [x] Request a one-shot high-accuracy position, and show permission, service-disabled, and timeout feedback.
- [x] Keep coordinates in memory; do not persist them or track in the background.
- [x] Convert WGS-84 coordinates to GCJ-02 for Tencent Maps and invert the existing calibrated transform for the campus image.
- [x] Display a blue location dot and recenter whichever 2D map provider is active.

### Task 3: Build the Android artifact

- [x] Run the existing production build and Capacitor sync.
- [ ] Install the Android SDK platform/build tools after the Android SDK license is accepted.
- [ ] Build the debug APK with the Android Gradle wrapper.
- [ ] Verify the APK file exists and report its exact path and install steps.

## Verification

- Do not add or run automated tests unless requested.
- Run `npm run build` for the web bundle.
- Run the Android Gradle `assembleDebug` task and confirm the APK artifact exists.
- Physical GPS and installation still require a real Android device; the desktop preview cannot grant native GPS permissions.
