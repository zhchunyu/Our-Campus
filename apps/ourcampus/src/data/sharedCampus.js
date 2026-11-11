import { REPO_BUILDINGS } from './sharedRepoBuildings.js'

const campus3dPositions = Object.freeze(Object.fromEntries(
  REPO_BUILDINGS.map((building) => [building.id, building.worldPosition]),
))

export const sharedCampusPositions = Object.freeze({
  // 地点位置直接来自共享仓库 navigation.campus.js 的 BUILDINGS 表。
  '2d': Object.freeze(Object.fromEntries(
    REPO_BUILDINGS.map((building) => [building.id, building.mapPosition]),
  )),
  '3d': campus3dPositions,
})

export const sharedCampusLabels = Object.freeze([
  { id: 'waterfront', name: '滨水景观带', position: [0.5, 0.24] },
  { id: 'humanities-axis', name: '中轴人文区', position: [0.5, 0.58] },
  { id: 'technology-zone', name: '科技区', position: [0.325, 0.48] },
  { id: 'research-zone', name: '实验区', position: [0.672, 0.48] },
  { id: 'sports-medical-zone', name: '运动医疗区', position: [0.325, 0.66] },
  { id: 'teaching-zone', name: '教学区', position: [0.672, 0.66] },
  { id: 'living-zone-west', name: '生活区 · 宿舍', position: [0.354, 0.8] },
  { id: 'living-zone-east', name: '生活区 · 食堂商业', position: [0.646, 0.8] },
  { id: 'main-gate', name: '主校门牌坊', position: [0.5, 0.91] },
])
