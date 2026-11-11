import { describe, expect, it } from 'vitest'
import { campusRouteGraph } from '../data/routeGraph.js'
import { createDemoRoute, ROUTE_MODES } from './route.js'
import { createCampusRoute } from './route.js'

describe('route domain helpers', () => {
  it('creates a preview route without a map implementation', () => {
    const route = createDemoRoute({
      originId: 'east-gate',
      destinationId: 'library',
      mode: ROUTE_MODES.RAIN,
    })

    expect(route).toMatchObject({
      originId: 'east-gate',
      destinationId: 'library',
      mode: 'rain',
      status: 'preview',
    })
    expect(route.distance).toBeGreaterThan(0)
    expect(route.durationMinutes).toBeGreaterThan(0)
    expect(route.segments.length).toBeGreaterThan(0)
  })

  it('returns an arrived state when the simulated origin is already the destination', () => {
    const route = createCampusRoute({ originId: 'library', destinationId: 'library' })

    expect(route).toMatchObject({
      originId: 'library',
      destinationId: 'library',
      status: 'arrived',
      distance: 0,
      durationMinutes: 0,
    })
  })

  it('returns null only when an endpoint is incomplete', () => {
    expect(createDemoRoute({ originId: null, destinationId: 'library' })).toBeNull()
    expect(createDemoRoute({ originId: 'library', destinationId: 'library' }).status).toBe('arrived')
  })

  it('returns model-coordinate points for a shortest route', () => {
    const route = createCampusRoute({
      originId: 'east-gate',
      destinationId: 'library',
      mode: ROUTE_MODES.SHORTEST,
      graph: campusRouteGraph,
    })

    expect(route.status).toBe('preview')
    expect(route.nodeIds[0]).toBe('main-gate-entry')
    expect(route.nodeIds.at(-1)).toBe('library-entry')
    expect(route.points[0][0]).toBe(0)
    expect(route.points[0][1]).toBe(3)
    expect(route.points[0][2]).toBeCloseTo(-16.2)
    expect(route.points.at(-1)).toEqual([0, 3, -448.2])
    expect(route.distance).toBeGreaterThan(0)
  })

  it('avoids blocked edges for avoid-construction mode', () => {
    const route = createCampusRoute({
      originId: 'east-gate',
      destinationId: 'teaching-a',
      mode: ROUTE_MODES.SHORTEST,
      graph: campusRouteGraph,
      blockedEdgeIds: ['road:inner_e_s7:inner_e_s8'],
    })

    expect(route.status).toBe('preview')
    expect(route.nodeIds).not.toContain('inner_e_s7')
    expect(route.nodeIds).toContain('outer_e1')
  })

  it('recomputes around dynamically blocked edges from live events', () => {
    const route = createCampusRoute({
      originId: 'east-gate',
      destinationId: 'teaching-a',
      mode: ROUTE_MODES.SHORTEST,
      graph: campusRouteGraph,
      blockedEdgeIds: ['road:inner_e_s7:inner_e_s8'],
    })

    expect(route.status).toBe('preview')
    expect(route.nodeIds).not.toContain('inner_e_s7')
    expect(route.blockedEdgeIds).toContain('road:inner_e_s7:inner_e_s8')
  })

  it('returns a usable route for every supported mode', () => {
    Object.values(ROUTE_MODES).forEach((mode) => {
      const route = createCampusRoute({
        originId: 'east-gate',
        destinationId: 'library',
        mode,
        graph: campusRouteGraph,
      })

      expect(route).toMatchObject({ mode, status: 'preview' })
      expect(route.points.length).toBeGreaterThan(1)
      expect(route.distance).toBeGreaterThan(0)
    })
  })

  it('returns an unavailable result instead of a fake line when no route exists', () => {
    const graph = { nodes: { a: { position: [0, 4, 0] }, b: { position: [1, 4, 0] } }, edges: [] }
    const route = createCampusRoute({
      originId: 'a-location',
      destinationId: 'b-location',
      originNodeId: 'a',
      destinationNodeId: 'b',
      graph,
    })

    expect(route).toMatchObject({ status: 'unavailable', points: [], nodeIds: [] })
  })
})
