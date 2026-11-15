import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getCampusRestaurants, openCampusRestaurant, resolveCourseLocation, selectCampusEvents } from './campusConnections.js'
import { ExplorePanel } from './ExplorePanel.jsx'
import { CampusEventCalendar } from './CampusEventCalendar.jsx'

const locations = [
  { id: 'teaching-a', name: '崇学楼', aliases: ['一教', '教学楼'], category: 'learning' },
  { id: 'teaching-b', name: '崇文楼', aliases: ['旧教学楼'], category: 'learning' },
  { id: 'canteen', name: '谷园餐厅', aliases: ['谷园'], category: 'dining' },
  { id: 'dining-center', name: '饮食中心', category: 'dining' },
]

describe('campus task connections', () => {
  it('connects an explicit building and its room without treating a room number as coordinates', () => {
    expect(resolveCourseLocation(' 崇学楼（Ａ２０３） ', locations)).toMatchObject({ status: 'matched', locationId: 'teaching-a' })
    expect(resolveCourseLocation('一教-203室', locations)).toMatchObject({ status: 'matched', locationId: 'teaching-a' })
    expect(resolveCourseLocation('崇学楼二层203', locations)).toMatchObject({ status: 'matched', locationId: 'teaching-a' })
  })
  it('requires a user choice for generic, partial, unknown and empty room descriptions', () => {
    for (const room of ['教学楼201', '203', '崇学楼旁新楼203', '崇学', '', '待定']) {
      expect(resolveCourseLocation(room, locations)).toMatchObject({ status: 'unmatched', locationId: null })
    }
  })
  it('keeps multiple exact building or alias matches ambiguous', () => {
    const duplicateAlias = [...locations, { id: 'west-teaching', name: '西区教学楼', aliases: ['一教'] }]
    const result = resolveCourseLocation('一教203', duplicateAlias)
    expect(result.status).toBe('ambiguous')
    expect(result.locationId).toBeNull()
    expect(result.candidates.map(item => item.id)).toEqual(['teaching-a', 'west-teaching'])
  })
  it('opens the exact associated restaurant and never substitutes another dining location', () => {
    const onOpen = vi.fn()
    expect(getCampusRestaurants(locations, '谷园').map(item => item.id)).toEqual(['canteen'])
    expect(openCampusRestaurant('canteen', locations, onOpen)).toBe(true)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('canteen')
    expect(openCampusRestaurant('dining-center', locations, onOpen)).toBe(false)
    expect(openCampusRestaurant('missing', locations, onOpen)).toBe(false)
    expect(openCampusRestaurant('canteen', locations)).toBe(false)
  })
  it('presents six short campus categories and usable places immediately', () => {
    const html = renderToStaticMarkup(<ExplorePanel locations={locations} allLocations={locations} selectedId="teaching-a" query="" category="all" />)
    for (const label of ['找地点', '吃饭', '附近', '办事', '活动', '报修', '崇学楼']) expect(html).toContain(label)
    expect(html).not.toContain('人流')
    expect(html).not.toContain('开放中')
    expect(html).not.toContain('校园工具')
  })
  it('makes eating a direct restaurant task without fabricated ratings or prices', () => {
    const html = renderToStaticMarkup(<ExplorePanel locations={locations} allLocations={locations} section="food" query="" category="all" onOpenRestaurantReviews={() => {}} />)
    expect(html).toContain('谷园餐厅')
    expect(html).toContain('窗口与评价')
    expect(html).not.toContain('饮食中心')
    expect(html).not.toContain('评分')
    expect(html).not.toContain('¥')
  })
})

describe('campus event time intentions', () => {
  const now = new Date('2026-11-15T16:30:00Z') // Nov 16, 00:30 in Shanghai
  const events = [
    { id: 'overnight', type: 'activity', startAt: '2026-11-15T23:00:00+08:00', endAt: '2026-11-16T01:00:00+08:00' },
    { id: 'finished', type: 'activity', startAt: '2026-11-15T10:00:00+08:00', endAt: '2026-11-15T11:00:00+08:00' },
    { id: 'future', type: 'activity', startAt: '2026-11-17T10:00:00+08:00' },
    { id: 'unknown-end', type: 'activity', startAt: '2026-11-16T00:10:00+08:00' },
    { id: 'invalid', type: 'activity', startAt: 'invalid' },
    { id: 'notice', type: 'notice', startAt: '2026-11-16T00:10:00+08:00' },
  ]
  it('keeps a cross-midnight event on both days it actually spans', () => {
    expect(selectCampusEvents(events, { intent: 'date', date: '2026-11-16', now }).map(item => item.id)).toEqual(['overnight', 'unknown-end'])
  })
  it('separates future and ended events while unknown end times stay unknown', () => {
    expect(selectCampusEvents(events, { intent: 'upcoming', now }).map(item => item.id)).toEqual(['overnight', 'unknown-end', 'future'])
    expect(selectCampusEvents(events, { intent: 'past', now }).map(item => item.id)).toEqual(['finished'])
  })
  it('does not claim a malformed end time means an event finished', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(now)
      const html = renderToStaticMarkup(<CampusEventCalendar locations={[]} events={[{ id: 'bad-range', type: 'activity', title: '结束待核对的活动', startAt: '2026-11-16T00:10:00+08:00', endAt: '2026-11-15T10:00:00+08:00' }]} />)
      expect(html).toContain('结束时间待确认')
      expect(html).not.toContain('11/15')
      expect(html).not.toContain('<small>已结束</small>')
    } finally { vi.useRealTimers() }
  })
})
