# Campus Hall Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the bottom trip tab with a campus hall containing region-filtered demo messages and a local message composer.

**Architecture:** Keep the four-tab shell, change the third tab to `hall`, and hold demo messages and selected region in `App` state so they survive tab changes until reload. Put region/message seed data in a focused data module and render/filter/compose messages in a mobile panel. Keep the existing trip panel available for map-originated route actions.

**Tech Stack:** React 19, Vite, existing Lucide icons, CSS in `src/styles.css`.

---

## File map

- Create `src/data/campusHall.js` for fixed demo regions, seed messages, and a region filter helper.
- Create `src/features/mobile/HallPanel.jsx` for the responsive feed, filter controls, and local composer.
- Modify `src/features/mobile/MobileTabBar.jsx` to replace the route tab with the hall tab.
- Modify `src/App.jsx` to own message/filter state, render the hall, and preserve route panel navigation for map actions.
- Modify `src/styles.css` for scrollable region chips, message cards, and the composer above the bottom navigation.

## Task 1: Add campus hall demo data

**Files:** Create `src/data/campusHall.js`.

- [x] Define the five approved regions and stable seed messages. Message text must read as sample conversation, not as a current campus fact.
- [x] Export a pure `filterHallMessages(messages, regionId)` function. For `all`, return every message; otherwise return only messages whose `regionId` matches.
- [x] Create locally submitted messages with author `我`, a unique ID, the selected region ID, a current time label, and trimmed content. Do not write to localStorage or a server.

Region shape:

```js
export const CAMPUS_HALL_REGIONS = [
  { id: 'all', label: '全部' },
  { id: 'teaching', label: '教学区' },
  { id: 'living', label: '生活区' },
  { id: 'dorm', label: '宿舍区' },
  { id: 'sports', label: '运动区' },
  { id: 'gate', label: '校门周边' },
]
```

Message records use `{ id, author, regionId, time, content }`. Keep labels derived from the region list rather than duplicated on each record.

## Task 2: Build the mobile hall panel

**Files:** Create `src/features/mobile/HallPanel.jsx`.

- [x] Accept `messages`, `selectedRegionId`, `onRegionChange`, and `onSendMessage` props. Keep the current text and composer region in component state; default composer region to `living`.
- [x] Render a heading with a visible “演示大厅 · 消息仅在本机显示” note, horizontally scrollable region buttons with `aria-pressed`, and filtered message cards showing author, region, time, and content.
- [x] Submit only trimmed, non-empty text. Call `onSendMessage({ content, regionId })`, then clear the text field. Associate the form label with the textbox and disable Send for blank input.
- [x] When a message is added, scroll the new message into view using an element ref with `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
- [x] Show an empty-state message for a region with no matching posts. Do not show fabricated online counts or claim messages are live.

Panel contract:

```jsx
<HallPanel
  messages={visibleHallMessages}
  selectedRegionId={hallRegionId}
  onRegionChange={setHallRegionId}
  onSendMessage={appendHallMessage}
/>
```

## Task 3: Replace the bottom navigation entry and wire app state

**Files:** Modify `src/features/mobile/MobileTabBar.jsx` and `src/App.jsx`.

- [x] Use the `MessagesCircle` or `MessagesSquare` Lucide icon for tab `{ id: 'hall', label: '大厅' }`; preserve the order `map`, `explore`, `hall`, `me`.
- [x] Initialize `hallMessages` with `INITIAL_HALL_MESSAGES` and `hallRegionId` with `all` in `App`. Append submitted messages immutably using `createHallMessage`.
- [x] Derive visible hall messages with `filterHallMessages`, render `HallPanel` for `activeTab === 'hall'`, and remove the bottom-nav `routes` entry.
- [x] Keep `TripPanel` reachable when map detail flow sets `activeTab` to `routes`; retain its route controls and the map route overlay.

Example parent state:

```jsx
const [hallMessages, setHallMessages] = useState(INITIAL_HALL_MESSAGES)
const [hallRegionId, setHallRegionId] = useState('all')
const visibleHallMessages = useMemo(
  () => filterHallMessages(hallMessages, hallRegionId),
  [hallMessages, hallRegionId],
)
```

## Task 4: Style and verify in the phone preview

**Files:** Modify `src/styles.css`.

- [x] Add hall-specific styles alongside the other mobile page rules. Keep the existing light background, green accents, rounded cards, and spacing scale.
- [x] Make region chips a single horizontally scrollable row with a clear selected state.
- [x] Keep the message feed vertically scrollable and the composer above the fixed bottom navigation, including safe-area insets.
- [x] Run `npm run build` and resolve any build errors.
- [x] Open the existing mobile preview and verify: `大厅` replaces `行程`; “全部” is selected by default; filtering updates visible cards; sending text appends an `我` card with its chosen region; switching away and back preserves the message until reload; map route planning still opens from its existing map entry.

## Scope guard

Do not add a chat server, accounts, persistence, realtime transport, moderation, likes, replies, or private rooms. Do not modify campus location region data or unrelated existing map/route behavior.
