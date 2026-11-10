import { describe, expect, it } from 'vitest'
import { buildAuvContext } from './auvContext.js'
const locations = [{ id: 'library' }, { id: 'east-gate' }]
const now = new Date('2026-11-10T08:00:00.000Z')
const course = { id: 'math', name: '高等数学', teacher: '不应上传的教师字段', classroom: '教学楼201', weekday: 2, weeks: [11], periods: [1, 2], startTime: '08:00', endTime: '09:40' }
const timetable = { version: 1, semester: '2026-2027-1', termStart: '2026-08-31', dateConfirmed: true, courses: [course], unscheduled: [{ name: '未排课程', note: '仅本机备注' }] }
const build = (patch = {}) => buildAuvContext({ locations, now, ...patch })
describe('AUV app context snapshot', () => {
  it('does not infer current position from a viewed place or the default route origin', () => {
    const context = build({ selectedLocationId: 'library', routePlan: { originId: 'east-gate', destinationId: 'library', mode: 'shortest' } })
    expect(context.locationSource).toBe('unknown')
    expect(context).not.toHaveProperty('currentLocationId')
    expect(context.capturedAt).toBe(now.toISOString())
  })
  it('accepts only an explicit manual current-location ID that exists in the catalog', () => {
    expect(build({ manualLocationId: 'library' })).toMatchObject({ locationSource: 'user_selected', currentLocationId: 'library' })
    expect(build({ manualLocationId: 'missing' })).not.toHaveProperty('currentLocationId')
  })
  it('does not transmit precise position or pretend an old GPS observation was just collected', () => {
    const context = build({ position: { lat: 1, lng: 2, timestamp: 1, accuracy: 5 }, deviceLocationStatus: 'error' })
    expect(context.locationSource).toBe('unknown')
    expect(context).not.toHaveProperty('position')
    expect(context).not.toHaveProperty('locationCapturedAt')
  })
  it('captures request time afresh without refreshing unrelated observation times', () => {
    const later = new Date(now.getTime() + 60000)
    expect(build({ now: later }).capturedAt).toBe(later.toISOString())
  })
  it('sends only existing route IDs and a supported mode, excluding demo ETA and route geometry', () => {
    const routePlan = { originId: 'east-gate', destinationId: 'library', mode: 'shortest', durationMinutes: 3, distance: 100, points: [[1, 2]], status: 'preview' }
    expect(build({ routePlan }).route).toEqual({ originId: 'east-gate', destinationId: 'library', mode: 'shortest' })
    expect(build({ routePlan: { ...routePlan, destinationId: 'missing' } })).not.toHaveProperty('route')
    expect(build({ routePlan: { ...routePlan, mode: 'unsupported' } })).not.toHaveProperty('route')
  })
  it('omits unknown favorites instead of overriding cloud data with an empty list', () => {
    expect(build()).not.toHaveProperty('favoriteIds')
    expect(build({ favoriteIds: [] }).favoriteIds).toEqual([])
    expect(build({ favoriteIds: ['library', 'missing', 'library'] }).favoriteIds).toEqual(['library'])
  })
  it('sends course classrooms and calendar facts without teacher or local notes', () => {
    const result = build({ timetable }).timetable
    expect(result).toMatchObject({ semester: timetable.semester, termStart: timetable.termStart, dateConfirmed: true, truncated: false, courses: [{ id: 'math', name: '高等数学', classroom: '教学楼201', weekday: 2, weeks: [11], periods: [1, 2], startTime: '08:00', endTime: '09:40' }], unscheduled: [{ name: '未排课程' }] })
    expect(JSON.stringify(result)).not.toContain('不应上传')
    expect(JSON.stringify(result)).not.toContain('仅本机备注')
  })
  it('preserves unconfirmed dates without manufacturing a Monday or the current week', () => {
    const result = build({ timetable: { ...timetable, termStart: '2026-08-30', dateConfirmed: false } }).timetable
    expect(result.dateConfirmed).toBe(false)
    expect(result.termStart).toBe('2026-08-30')
    expect(result).not.toHaveProperty('currentWeek')
    expect(build({ timetable: { ...timetable, courses: [{ ...course, startTime: 'bad' }] } })).not.toHaveProperty('timetable')
  })
  it('caps courses and reports truncation without modifying the saved timetable', () => {
    const large = { ...timetable, courses: Array.from({ length: 105 }, (_, id) => ({ ...course, id: `course-${id}` })) }
    const context = build({ timetable: large })
    expect(context.timetable.courses).toHaveLength(100)
    expect(context.timetable.truncated).toBe(true)
    expect(large.courses).toHaveLength(105)
  })
  it('bounds encoded context bytes for long valid course names and classrooms', () => {
    const large = { ...timetable, courses: Array.from({ length: 100 }, (_, id) => ({ ...course, id: `course-${id}`, name: '课'.repeat(100), classroom: '室'.repeat(100) })) }
    const context = build({ timetable: large })
    expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(40000)
    expect(context.timetable.truncated).toBe(true)
    expect(context.timetable.courses.length).toBeGreaterThan(0)
  })
})

it('builds a short question for the user-selected teaching week without embedding all courses or guessing dates', async () => {
  const api = await import('./auvContext.js')
  expect(api.createTimetablePlanningQuestion).toBeTypeOf('function')
  const question = api.createTimetablePlanningQuestion(11)
  expect(question).toContain('第11教学周')
  expect(question).toContain('未校准')
  expect(question).not.toContain('当前第')
  expect([...question].length).toBeLessThan(1000)
  expect(() => api.createTimetablePlanningQuestion(0)).toThrow()
  expect(() => api.createTimetablePlanningQuestion(31)).toThrow()
})
