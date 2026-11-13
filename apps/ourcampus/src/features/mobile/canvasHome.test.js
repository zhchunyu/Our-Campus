import { describe, expect, it } from 'vitest'
import { canvasEvents, canvasWeek, restoreCanvasOrder } from './canvasHome.js'

describe('canvas content rules', () => {
  it('uses the Shanghai day at UTC midnight boundaries and handles a year-crossing week', () => {
    expect(canvasWeek(new Date('2026-11-11T17:00:00Z'))).toEqual({ range: '11.09—11.15', today: '11月12日', weekday: '周四' })
    expect(canvasWeek(new Date('2027-01-01T02:00:00Z')).range).toBe('12.28—01.03')
  })
  it('does not revive expired/closed records and keeps cloud content ahead of examples', () => {
    const now = Date.parse('2026-11-12T04:00:00Z')
    const base = { status: 'active', startAt: '2026-11-12T01:00:00Z', endAt: '2026-11-13T01:00:00Z' }
    expect(canvasEvents([{ ...base, id: 'example' }, { ...base, id: 'closed', status: 'closed' }, { ...base, id: 'cloud', isCloud: true }, { ...base, id: 'expired', endAt: '2026-11-11T01:00:00Z' }], now).map((event) => event.id)).toEqual(['cloud', 'example'])
  })
  it('discards stale or duplicate section identifiers without losing new content', () => {
    expect(restoreCanvasOrder(['space', 'events', 'places'], ['places', 'places', 'removed'])).toEqual(['places', 'space', 'events'])
  })
})
