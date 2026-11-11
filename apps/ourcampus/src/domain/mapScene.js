import { campusRouteGraph } from '../data/routeGraph.js'

export const MAP_SCENES = Object.freeze({
  TWO_D: '2d',
  THREE_D: '3d',
})

export function isMapScene(scene) {
  return scene === MAP_SCENES.TWO_D || scene === MAP_SCENES.THREE_D
}

export function getLocationMapPosition(location, scene) {
  return location?.mapPosition?.[scene] ?? null
}

export function getRouteMapPoints(routePlan, scene) {
  if (!routePlan?.nodeIds?.length) return null

  const points = routePlan.nodeIds.map((nodeId) => (
    campusRouteGraph.nodes[nodeId]?.mapPosition?.[scene] ?? null
  ))

  return points.every(Boolean) ? points : null
}
