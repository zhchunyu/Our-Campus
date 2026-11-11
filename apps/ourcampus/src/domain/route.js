import { campusRouteGraph, getEntryNodeId } from '../data/routeGraph.js'

export const ROUTE_MODES = Object.freeze({
  SHORTEST: 'shortest',
  ACCESSIBLE: 'accessible',
  AVOID_CONSTRUCTION: 'avoid-construction',
  RAIN: 'rain',
  NIGHT: 'night',
})

export const ROUTE_MODE_LABELS = Object.freeze({
  shortest: '最短路线',
  accessible: '无障碍路线',
  'avoid-construction': '避开施工',
  rain: '避雨路线',
  night: '夜间安全',
})

export const ROUTE_MODE_DESCRIPTIONS = Object.freeze({
  shortest: '优先缩短校园路网距离。',
  accessible: '只使用路网标记为无障碍的路段。',
  'avoid-construction': '优先绕开路网中的施工路段。',
  rain: '优先选择有遮挡的校园道路。',
  night: '优先选择标记为夜间安全的道路。',
})

const COMPASS_DIRECTIONS = Object.freeze(['北', '东北', '东', '东南', '南', '西南', '西', '西北'])

function getCompassDirection(from, to) {
  const dx = to.position[0] - from.position[0]
  const dz = to.position[2] - from.position[2]
  if (Math.hypot(dx, dz) < 0.01) return '继续直行'

  const bearing = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)
  const directionIndex = Math.round(bearing / (Math.PI / 4)) % COMPASS_DIRECTIONS.length
  return `向${COMPASS_DIRECTIONS[directionIndex]}`
}

export function getRouteInstructions(routePlan, locations = [], graph = campusRouteGraph) {
  if (routePlan?.status !== 'preview') return []

  const locationNames = new Map(locations.map((location) => [location.id, location.name]))
  const instructions = []

  routePlan.segments.forEach((segment) => {
    const from = graph.nodes[segment.from]
    const to = graph.nodes[segment.to]
    if (!from?.position || !to?.position) return

    const direction = getCompassDirection(from, to)
    const destinationName = to.locationId
      ? locationNames.get(to.locationId) ?? to.locationId
      : null
    const lastInstruction = instructions.at(-1)

    if (lastInstruction?.direction === direction && !lastInstruction.destinationName) {
      lastInstruction.distance += segment.distance
      lastInstruction.destinationName = destinationName
      return
    }

    instructions.push({
      direction,
      distance: segment.distance,
      destinationName,
    })
  })

  return instructions.map((instruction) => ({
    ...instruction,
    distance: Math.round(instruction.distance),
  }))
}

export function getRouteModeDescription(routePlan) {
  if (routePlan?.status === 'unavailable') {
    if (routePlan.unavailableReason === 'origin-closed') return '出发地点暂时关闭，请选择其他起点。'
    if (routePlan.unavailableReason === 'destination-closed') return '目的地点暂时关闭，请选择其他目的地。'
    return '当前路线模式下没有可用路线，请更换路线模式或起终点。'
  }

  const description = ROUTE_MODE_DESCRIPTIONS[routePlan?.mode] ?? ROUTE_MODE_DESCRIPTIONS.shortest
  const blockedCount = routePlan?.blockedEdgeIds?.length ?? 0
  return blockedCount ? `${description}本次计算已排除 ${blockedCount} 段有效封闭道路。` : description
}

function edgeAllowed(edge, mode, blockedEdgeIds) {
  if (blockedEdgeIds.has(edge.id)) return false
  if (mode === ROUTE_MODES.ACCESSIBLE && !edge.accessible) return false
  if (mode === ROUTE_MODES.AVOID_CONSTRUCTION && edge.blocked) return false
  return true
}

function edgeCost(edge, mode) {
  if (mode === ROUTE_MODES.RAIN) return edge.distance * (edge.covered ? 0.65 : 1.35)
  if (mode === ROUTE_MODES.NIGHT) return edge.distance * (edge.safeAtNight ? 0.8 : 1.3)
  return edge.distance
}

function heuristic(a, b) {
  const dx = a.position[0] - b.position[0]
  const dz = a.position[2] - b.position[2]
  return Math.hypot(dx, dz)
}

function buildAdjacency(edges, mode, blockedEdgeIds) {
  const adjacency = new Map()

  const add = (from, to, edge) => {
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from).push({ nodeId: to, edge })
  }

  edges.filter((edge) => edgeAllowed(edge, mode, blockedEdgeIds)).forEach((edge) => {
    add(edge.from, edge.to, edge)
    add(edge.to, edge.from, edge)
  })

  return adjacency
}

function reconstruct(cameFrom, current) {
  const path = [current]
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)
    path.unshift(current)
  }
  return path
}

function findEdge(graph, from, to) {
  return graph.edges.find((edge) => (
    (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)
  ))
}

export function createUnavailableRoute(originId, destinationId, mode, unavailableReason = 'no-available-path') {
  return {
    originId,
    destinationId,
    mode,
    distance: 0,
    durationMinutes: 0,
    status: 'unavailable',
    unavailableReason,
    segments: [],
    nodeIds: [],
    points: [],
  }
}

function arrivedRoute(originId, destinationId, mode) {
  return {
    originId,
    destinationId,
    mode,
    distance: 0,
    durationMinutes: 0,
    status: 'arrived',
    segments: [],
    nodeIds: [],
    points: [],
  }
}

function buildRouteResult({ originId, destinationId, mode, nodeIds, graph, blockedEdgeIds }) {
  const segments = []
  let distance = 0

  for (let index = 1; index < nodeIds.length; index += 1) {
    const from = nodeIds[index - 1]
    const to = nodeIds[index]
    const edge = findEdge(graph, from, to)
    const segmentDistance = edge?.distance ?? heuristic(graph.nodes[from], graph.nodes[to])
    segments.push({
      from,
      to,
      distance: segmentDistance,
      accessible: edge?.accessible ?? false,
      covered: edge?.covered ?? false,
      safeAtNight: edge?.safeAtNight ?? false,
    })
    distance += segmentDistance
  }

  return {
    originId,
    destinationId,
    mode,
    distance: Math.round(distance),
    durationMinutes: Math.max(1, Math.ceil(distance / 60)),
    status: 'preview',
    segments,
    nodeIds,
    points: nodeIds.map((id) => graph.nodes[id].position),
    blockedEdgeIds: [...blockedEdgeIds],
  }
}

export function createCampusRoute({
  originId,
  destinationId,
  mode = ROUTE_MODES.SHORTEST,
  graph = campusRouteGraph,
  originNodeId,
  destinationNodeId,
  blockedEdgeIds = [],
}) {
  if (!originId || !destinationId) return null
  if (originId === destinationId) return arrivedRoute(originId, destinationId, mode)

  const start = originNodeId ?? getEntryNodeId(originId)
  const goal = destinationNodeId ?? getEntryNodeId(destinationId)
  if (!start || !goal || !graph.nodes[start] || !graph.nodes[goal]) {
    return createUnavailableRoute(originId, destinationId, mode)
  }

  const dynamicBlockedEdges = new Set(blockedEdgeIds)
  const adjacency = buildAdjacency(graph.edges, mode, dynamicBlockedEdges)
  const open = new Set([start])
  const cameFrom = new Map()
  const gScore = new Map([[start, 0]])
  const fScore = new Map([[start, heuristic(graph.nodes[start], graph.nodes[goal])]])

  while (open.size) {
    const current = [...open].sort((a, b) => fScore.get(a) - fScore.get(b))[0]
    if (current === goal) {
      return buildRouteResult({
        originId,
        destinationId,
        mode,
        nodeIds: reconstruct(cameFrom, current),
        graph,
        blockedEdgeIds: dynamicBlockedEdges,
      })
    }

    open.delete(current)
    for (const connection of adjacency.get(current) ?? []) {
      const tentative = gScore.get(current) + edgeCost(connection.edge, mode)
      if (tentative >= (gScore.get(connection.nodeId) ?? Infinity)) continue

      cameFrom.set(connection.nodeId, current)
      gScore.set(connection.nodeId, tentative)
      fScore.set(
        connection.nodeId,
        tentative + heuristic(graph.nodes[connection.nodeId], graph.nodes[goal]),
      )
      open.add(connection.nodeId)
    }
  }

  return createUnavailableRoute(originId, destinationId, mode)
}

export function createDemoRoute(args) {
  return createCampusRoute({ ...args, graph: args.graph ?? campusRouteGraph })
}
