import { REPO_BUILDINGS, REPO_BUILDING_BY_ID, buildingDoorPosition, findNearestRoadNode } from './sharedRepoBuildings.js'
import {
  ROAD_EDGES,
  ROAD_GROUND_Y,
  ROAD_NODES,
  roadEdgeId,
  roadNodeToPosition,
  worldToMapPosition,
} from './roadNetwork.js'

const mapPosition = (position) => ({
  '2d': worldToMapPosition(position),
  '3d': position,
})

const roadNode = (id) => {
  const position = roadNodeToPosition(id)
  return {
    id,
    position,
    kind: 'road-junction',
    mapPosition: mapPosition(position),
  }
}

const nodes = Object.fromEntries(Object.keys(ROAD_NODES).map((id) => [id, roadNode(id)]))

// 每个仓库 BUILDINGS 条目都生成一个门口节点，再通过最接近且符合入口方向的道路节点接驳。
// 这样地点搜索、2D 路线和 3D 路线都使用同一套仓库建筑数据。
const locationEntries = Object.fromEntries(REPO_BUILDINGS.map((building) => {
  const access = findNearestRoadNode(building)
  const position = buildingDoorPosition(building, access.id)
  return [building.entryNodeId, {
    locationId: building.id,
    position,
    accessRoad: access.id,
    accessEdgeId: `access:${building.id}:${access.id}`,
  }]
}))

Object.entries(locationEntries).forEach(([id, entry]) => {
  nodes[id] = {
    id,
    position: entry.position,
    kind: 'location-entry',
    locationId: entry.locationId,
    mapPosition: mapPosition(entry.position),
  }
})

const distanceBetween = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])

const roadEdges = ROAD_EDGES.map(([from, to]) => {
  const covered = from.startsWith('inner_') || to.startsWith('inner_')
    || from.startsWith('ring_') || to.startsWith('ring_')
  const distance = distanceBetween(nodes[from].position, nodes[to].position)
  return {
    id: roadEdgeId(from, to),
    from,
    to,
    distance: Math.round(distance * 10) / 10,
    accessible: true,
    covered,
    blocked: false,
    safeAtNight: true,
  }
})

const accessEdges = Object.entries(locationEntries).map(([entryId, entry]) => {
  const distance = distanceBetween(nodes[entryId].position, nodes[entry.accessRoad].position)
  const building = REPO_BUILDINGS.find((item) => item.id === entry.locationId)
  return {
    id: entry.accessEdgeId,
    from: entryId,
    to: entry.accessRoad,
    distance: Math.round(distance * 10) / 10,
    accessible: true,
    covered: building?.type === 'landmark' || building?.type === 'tech',
    blocked: false,
    safeAtNight: true,
  }
})

export const campusRouteGraph = Object.freeze({
  nodes: Object.freeze(nodes),
  edges: Object.freeze([...roadEdges, ...accessEdges]),
})

export function getEntryNodeId(locationId) {
  return Object.values(campusRouteGraph.nodes).find((item) => item.locationId === locationId)?.id ?? null
}

export function getRepositoryRoadStats() {
  return {
    nodeCount: Object.keys(ROAD_NODES).length,
    edgeCount: ROAD_EDGES.length,
    locationEntryCount: REPO_BUILDINGS.length,
    groundY: ROAD_GROUND_Y,
  }
}

function roadAreaLabel(nodeId) {
  if (nodeId.startsWith('outer_')) return '外环'
  if (nodeId.startsWith('inner_')) return '内环'
  if (nodeId.startsWith('axis_')) return '中轴'
  if (nodeId.startsWith('ring_')) return '环廊'
  if (nodeId.startsWith('rad_')) return '连接支路'
  if (nodeId.startsWith('dorm_access_')) return '宿舍接驳路'
  if (nodeId.startsWith('sport_access_')) return '运动区接驳路'
  return '校园道路'
}

export function getRoadEdgeOptions(locationId) {
  const building = REPO_BUILDING_BY_ID[locationId]
  if (!building) return []

  return campusRouteGraph.edges.map((edge) => {
    const from = campusRouteGraph.nodes[edge.from].position
    const to = campusRouteGraph.nodes[edge.to].position
    const midpoint = [(from[0] + to[0]) / 2, ROAD_GROUND_Y, (from[2] + to[2]) / 2]
    const distanceToBuilding = Math.round(distanceBetween(midpoint, building.worldPosition))
    const nearbyBuilding = REPO_BUILDINGS.reduce((closest, candidate) => (
      distanceBetween(midpoint, candidate.worldPosition) < distanceBetween(midpoint, closest.worldPosition)
        ? candidate
        : closest
    ), REPO_BUILDINGS[0])
    const isAccessEdge = edge.id.startsWith('access:')
    const area = roadAreaLabel(edge.from)

    return {
      id: edge.id,
      distanceToBuilding,
      label: isAccessEdge
        ? `${nearbyBuilding.name}入口接驳路`
        : `${nearbyBuilding.name}附近 · ${area}路段`,
      detail: `${edge.from} ↔ ${edge.to} · 距${building.name}约 ${distanceToBuilding} 米`,
    }
  }).sort((a, b) => a.distanceToBuilding - b.distanceToBuilding)
}
