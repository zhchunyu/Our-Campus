import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTimetableNavigation } from './timetableNavigation.js'
const course = { id: 'math', name: '数学', teacher: '', classroom: '201', weekday: 1, weeks: [1, 8, 9, 16], periods: [1, 2], startTime: '08:00', endTime: '09:40' }
const timetable = { version: 1, semester: '2026-2027-1', termStart: '2026-08-31', dateConfirmed: true, courses: [course], unscheduled: [] }
const sunday = new Date('2026-10-25T15:59:00Z')
const monday = new Date('2026-10-25T16:01:00Z')
let values
beforeEach(() => { values = new Map(); vi.stubGlobal('localStorage', { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }) })
afterEach(() => vi.unstubAllGlobals())
describe('daily timetable navigation lifetime', () => {
  it('opens on today and follows the Shanghai midnight into the new week', () => {
    const nav = createTimetableNavigation({ userId: 'a', timetable, now: sunday })
    expect(nav.getSnapshot()).toMatchObject({ week: 8, weekday: 7, followingToday: true })
    nav.tick(monday)
    expect(nav.getSnapshot()).toMatchObject({ week: 9, weekday: 1 })
  })
  it('does not interrupt a manually browsed day when the clock or same-anchor cloud data refreshes', () => {
    const nav = createTimetableNavigation({ userId: 'a', timetable, now: sunday })
    nav.selectWeek(3); nav.selectDay(2)
    nav.tick(monday); nav.updateTimetable({ ...timetable, courses: [...timetable.courses] })
    expect(nav.getSnapshot()).toMatchObject({ week: 3, weekday: 2, followingToday: false })
    nav.goToday()
    expect(nav.getSnapshot()).toMatchObject({ week: 9, weekday: 1, followingToday: true })
  })
  it('restores unknown-date viewing position on reopen without leaking between accounts or semesters', () => {
    const unknown = { ...timetable, dateConfirmed: false }
    const nav = createTimetableNavigation({ userId: 'a', timetable: unknown, now: sunday })
    nav.selectWeek(8); nav.selectDay(4)
    expect(createTimetableNavigation({ userId: 'a', timetable: unknown, now: monday }).getSnapshot()).toMatchObject({ week: 8, weekday: 4 })
    expect(createTimetableNavigation({ userId: 'b', timetable: unknown, now: monday }).getSnapshot().week).toBe(1)
    expect(createTimetableNavigation({ userId: 'a', timetable: { ...unknown, semester: '2026-2027-2' }, now: monday }).getSnapshot().week).toBe(1)
  })
  it('keeps preview navigation out of persisted history and cancel restores the exact manual view', () => {
    const nav = createTimetableNavigation({ userId: 'a', timetable, now: sunday })
    nav.selectWeek(4); nav.selectDay(3)
    const before = [...values.entries()]
    nav.startPreview({ ...timetable, dateConfirmed: false }); nav.selectWeek(12); nav.selectDay(6)
    expect([...values.entries()]).toEqual(before)
    nav.cancelPreview()
    expect(nav.getSnapshot()).toMatchObject({ week: 4, weekday: 3, preview: null, followingToday: false })
  })
  it('an asynchronously arriving confirmed timetable or an explicit date calibration immediately locates today', () => {
    const nav = createTimetableNavigation({ userId: 'a', timetable: null, now: sunday })
    nav.updateTimetable(timetable)
    expect(nav.getSnapshot()).toMatchObject({ week: 8, weekday: 7, followingToday: true })
    nav.selectWeek(2)
    nav.commit({ ...timetable, termStart: '2026-09-07' })
    expect(nav.getSnapshot()).toMatchObject({ week: 7, weekday: 7, followingToday: true })
  })
  it('clamps a selected week if changed course data shortens the semester and publishes immutable snapshots', () => {
    const long = { ...timetable, courses: [{ ...course, weeks: [30] }] }
    const nav = createTimetableNavigation({ userId: 'a', timetable: long, now: sunday })
    const listener = vi.fn(); const unsubscribe = nav.subscribe(listener)
    const first = nav.getSnapshot()
    nav.selectWeek(30); nav.updateTimetable(timetable)
    expect(nav.getSnapshot().week).toBe(16)
    expect(first.week).toBe(8)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe(); nav.selectDay(2)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

it('canceling an import after midnight restores a following view to the new today', () => {
  const nav = createTimetableNavigation({ userId: 'a', timetable, now: sunday })
  nav.startPreview({ ...timetable, dateConfirmed: false }); nav.selectWeek(4); nav.tick(monday)
  nav.cancelPreview()
  expect(nav.getSnapshot()).toMatchObject({ week: 9, weekday: 1, followingToday: true, preview: null })
})

it('new semester data resets an old manual selection instead of leaking that week into the next term', () => {
  const nav = createTimetableNavigation({ userId: 'a', timetable, now: sunday })
  nav.selectWeek(8); nav.selectDay(4)
  nav.updateTimetable({ ...timetable, semester: '2026-2027-2', termStart: '', dateConfirmed: false })
  expect(nav.getSnapshot()).toMatchObject({ week: 1, followingToday: false })
})
