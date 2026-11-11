import { describe, expect, it } from 'vitest'
import {
  canManage,
  canPublishEvents,
  filterLocations,
  filterHotspots,
  listActiveHotspots,
} from './campus.js'
import { locationRepository } from '../data/locations.js'
import { demoEvents } from '../data/events.js'

const locations = locationRepository.loadAll()

describe('campus domain helpers', () => {
  it('finds a location by name', () => {
    expect(filterLocations(locations, '图书馆', 'all').map((location) => location.id)).toEqual(['library'])
  })

  it('finds a location by keyword', () => {
    expect(filterLocations(locations, '自习', 'all').map((location) => location.id)).toEqual(['library'])
  })

  it('filters by category', () => {
    expect(filterLocations(locations, '', 'dining').map((location) => location.id)).toEqual(['canteen', 'commercial-street'])
  })

  it('returns every location with empty filters', () => {
    expect(filterLocations(locations, '', 'all')).toHaveLength(30)
  })

  it('only managers can manage campus status', () => {
    expect(canManage('manager')).toBe(true)
    expect(canManage('visitor')).toBe(false)
    expect(canManage('student')).toBe(false)
  })

  it('filters active hotspots by location and type', () => {
    const result = filterHotspots(demoEvents, { locationId: 'library', type: 'activity' })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('计算机学院讲座')
  })

  it('only managers can publish hotspots', () => {
    expect(canPublishEvents('manager')).toBe(true)
    expect(canPublishEvents('visitor')).toBe(false)
    expect(canPublishEvents('student')).toBe(false)
  })

  it('excludes expired active hotspots', () => {
    const result = listActiveHotspots([
      ...demoEvents,
      {
        id: 'expired-event',
        title: '已结束活动',
        type: 'activity',
        locationId: 'library',
        status: 'active',
        startAt: '2026-09-19T08:00:00+08:00',
        endAt: '2026-09-19T09:00:00+08:00',
      },
    ], new Date('2026-09-19T10:00:00+08:00'))

    expect(result.some((event) => event.id === 'expired-event')).toBe(false)
  })
})
