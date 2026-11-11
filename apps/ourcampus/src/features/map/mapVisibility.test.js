import { describe, expect, it } from 'vitest'
import { projectVisibleMapContent } from './mapVisibility.js'

describe('map visibility projection', () => {
  it('keeps location markers and hotspots visible when labels are hidden', () => {
    const projection = projectVisibleMapContent({
      visibleLocations: [{ id: 'library' }],
      events: [{ id: 'lecture', locationId: 'library', status: 'active' }],
      settings: { showLabels: false, showHotspots: true },
    })

    expect(projection.visibleLocationIds.has('library')).toBe(true)
    expect(projection.visibleEvents.map((event) => event.id)).toEqual(['lecture'])
  })

  it('hides hotspots without hiding location markers when the hotspot layer is off', () => {
    const projection = projectVisibleMapContent({
      visibleLocations: [{ id: 'library' }],
      events: [{ id: 'lecture', locationId: 'library', status: 'active' }],
      settings: { showLabels: true, showHotspots: false },
    })

    expect(projection.visibleLocationIds.has('library')).toBe(true)
    expect(projection.visibleEvents).toEqual([])
  })
})
