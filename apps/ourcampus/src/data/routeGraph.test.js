import { describe, expect, it } from 'vitest'
import { locationRepository } from './locations.js'
import { campusRouteGraph, getEntryNodeId } from './routeGraph.js'

describe('campus model bindings', () => {
  it('maps every demo location to a model anchor and an entry node', () => {
    const locations = locationRepository.loadAll()

    expect(locations).toHaveLength(30)
    locations.forEach((location) => {
      expect(location.source).toBe('shared-repo')
      expect(location.modelAnchorId === null || location.modelAnchorId.startsWith('ANCHOR_')).toBe(true)
      expect(getEntryNodeId(location.id)).toBeTruthy()
      expect(campusRouteGraph.nodes[getEntryNodeId(location.id)]).toBeTruthy()
    })
  })

  it('uses GLB coordinates in metres for core locations', () => {
    expect(campusRouteGraph.nodes['library-entry'].position).toEqual([0, 3, -448.2])
    expect(campusRouteGraph.nodes['main-gate-entry'].position[0]).toBe(0)
    expect(campusRouteGraph.nodes['main-gate-entry'].position[1]).toBe(3)
    expect(campusRouteGraph.nodes['main-gate-entry'].position[2]).toBeCloseTo(-16.2)
    expect(campusRouteGraph.nodes['gymnasium-entry'].position).toEqual([-262.992, 3, -340.8])

    expect(Object.keys(campusRouteGraph.nodes)).toHaveLength(127)
    expect(campusRouteGraph.edges).toHaveLength(140)
  })
})
