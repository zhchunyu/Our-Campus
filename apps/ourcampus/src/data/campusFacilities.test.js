import { describe, expect, it } from 'vitest'
import { calculateStraightDistance, listCampusFacilities } from './campusFacilities.js'
import { getTencentCampusPosition } from './tencentCampusGeo.js'

const locations = [
  { id: 'canteen', name: '谷园餐厅', category: 'dining', mapPosition: { '2d': [.5, .5] } },
  { id: 'hospital', name: '校医院', category: 'service', mapPosition: { '2d': [.9, .9] } },
  { id: 'library', name: '图书馆', category: 'learning', mapPosition: { '2d': [.3, .3] } },
]
describe('campus facilities', () => {
  it('returns no invented distance without valid location coordinates', () => {
    expect(calculateStraightDistance(null, { lat: 37, lng: 112 })).toBeNull()
    expect(calculateStraightDistance({ lat: NaN, lng: 112 }, { lat: 37, lng: 112 })).toBeNull()
    expect(calculateStraightDistance({ lat: 91, lng: 112 }, { lat: 37, lng: 112 })).toBeNull()
    expect(listCampusFacilities(locations).every((item) => item.distance === null)).toBe(true)
  })
  it('calculates approximate straight distances and orders from current position', () => {
    const origin = getTencentCampusPosition(locations[0])
    const items = listCampusFacilities(locations, [], origin)
    expect(items[0]).toMatchObject({ locationId: 'canteen', distance: 0 })
    expect(items[1].distance).toBeGreaterThan(0)
    expect(calculateStraightDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, 0)
  })
  it('excludes pending, rejected and unknown-building facilities', () => {
    const record = { id: 'water', locationId: 'library', type: 'water', name: '饮水点', detail: '二楼东侧' }
    expect(listCampusFacilities(locations, [{ ...record, status: 'pending' }], null, 'water')).toEqual([])
    expect(listCampusFacilities(locations, [{ ...record, status: 'rejected' }], null, 'water')).toEqual([])
    expect(listCampusFacilities(locations, [{ ...record, status: 'verified', locationId: 'unknown' }], null, 'water')).toEqual([])
    expect(listCampusFacilities(locations, [{ ...record, status: 'verified' }], null, 'water', '二楼')[0]).toMatchObject({ name: '饮水点', locationName: '图书馆', source: 'local-contribution', distance: null })
    expect(listCampusFacilities(locations, [], null, 'toilet')).toEqual([])
  })
})
