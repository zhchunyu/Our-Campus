import { describe, expect, it } from 'vitest'
import { getLocationMapPosition, getRouteMapPoints, isMapScene } from './mapScene.js'
import { locationRepository } from '../data/locations.js'
import { campusRouteGraph } from '../data/routeGraph.js'

describe('map scene helpers', () => {
  it('accepts only supported scenes', () => {
    expect(isMapScene('2d')).toBe(true)
    expect(isMapScene('3d')).toBe(true)
    expect(isMapScene('satellite')).toBe(false)
  })

  it('reads a location position for each scene', () => {
    const library = locationRepository.loadAll().find((location) => location.id === 'library')

    expect(getLocationMapPosition(library, '2d')).toEqual([0.5, 300 / 595])
    expect(getLocationMapPosition(library, '3d')).toEqual([0, 3, -518.4])
  })

  it('projects route node ids to 2D points', () => {
    const points = getRouteMapPoints({ nodeIds: ['main-gate-entry', 'axis_plaza', 'library-entry'] }, '2d')

    expect(points).toEqual([[0.5, 509.25 / 595], [0.5, 462 / 595], [0.5, 329.25 / 595]])
  })

  it('omits a route when a node has no coordinates', () => {
    const original = campusRouteGraph.nodes.axis_plaza.mapPosition
    campusRouteGraph.nodes.axis_plaza.mapPosition = { '3d': [0, 4, -129.6] }

    expect(getRouteMapPoints({ nodeIds: ['main-gate-entry', 'axis_plaza'] }, '2d')).toBeNull()

    campusRouteGraph.nodes.axis_plaza.mapPosition = original
  })
})
