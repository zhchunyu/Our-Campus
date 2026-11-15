import { describe, it, expect } from 'vitest'
import { nearbyRouteOrigins, validRouteOrigin } from './routeOrigin.js'
import { getTencentCampusPosition } from '../../data/tencentCampusGeo.js'
const now = 1_800_000_000_000
const places = [{ id: 'library', name: '图书馆', tencentPosition: { lat: 37.423, lng: 112.583 } }]
describe('explicit route origins', () => {
  it('does not substitute a preset gate for missing or invalid selection', () => {
    expect(validRouteOrigin('', places)).toBe(false)
    expect(validRouteOrigin('east-gate', places)).toBe(false)
    expect(validRouteOrigin('library', places)).toBe(true)
  })
  it('does not suggest from stale, inaccurate or invalid device positions', () => {
    for (const position of [null, {}, { lat: 37.423, lng: 112.583, timestamp: now - 180000, accuracy: 10 }, { lat: 37.423, lng: 112.583, timestamp: now, accuracy: 900 }]) expect(nearbyRouteOrigins(position, places, now)).toEqual([])
  })
  it('never offers distant campus buildings as if they were a GPS start', () => {
    expect(nearbyRouteOrigins({ lat: 39.9, lng: 116.4, timestamp: now, accuracy: 10 }, places, now)).toEqual([])
  })
  it('offers a nearby real campus place without confirming it automatically', () => {
    const position = { ...getTencentCampusPosition(places[0]), timestamp: now, accuracy: 15 }
    expect(nearbyRouteOrigins(position, places, now)).toEqual([{ place: places[0], distance: 0 }])
    expect(validRouteOrigin('', places)).toBe(false)
  })
})
