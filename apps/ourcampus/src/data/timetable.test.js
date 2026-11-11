import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as timetable from './timetable.js'

const at = (value) => new Date(value)
const course = (id, changes = {}) => ({ id, name: id, teacher: '教师', classroom: '教室', weekday: 1, weeks: [1, 2, 3], periods: [1, 2], startTime: '08:00', endTime: '09:40', ...changes })
const table = (changes = {}) => ({ version: 1, semester: '2026-2027-1', termStart: '2026-08-31', dateConfirmed: true, courses: [course('课A')], unscheduled: [], ...changes })
const api = (name) => { expect(timetable[name], name).toBeTypeOf('function'); return timetable[name] }

beforeEach(() => {
  const values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Shanghai teaching calendar', () => {
  it('reproduces the legacy unconfirmed Sunday anchor without treating it as a real current week', () => {
    vi.useFakeTimers(); vi.setSystemTime(at('2026-10-25T04:00:00Z'))
    expect(timetable.currentTeachingWeek(table({ termStart: '2026-08-30', dateConfirmed: false }))).toBe(1)
    expect(timetable.canUseCalendar(table({ termStart: '2026-08-30', dateConfirmed: true }))).toBe(false)
    expect(timetable.currentTeachingWeek(table())).toBe(8)
  })
  it('uses Shanghai Monday midnight independently of the device timezone', () => {
    const calendar = api('getShanghaiCalendar')
    expect(calendar(at('2026-10-25T15:59:59Z'))).toEqual({ date: '2026-10-25', weekday: 7, minutes: 1439 })
    expect(calendar(at('2026-10-25T16:00:00Z'))).toEqual({ date: '2026-10-26', weekday: 1, minutes: 0 })
    expect(calendar(Date.parse('2026-10-25T16:01:00Z')).minutes).toBe(1)
  })
  it('accepts the supplied clock rather than reading an unrelated system date', () => {
    vi.useFakeTimers(); vi.setSystemTime(at('2030-01-01T00:00:00Z'))
    expect(timetable.currentTeachingWeek(table(), at('2026-09-06T15:59:59Z'))).toBe(1)
    expect(timetable.currentTeachingWeek(table(), at('2026-09-06T16:00:00Z'))).toBe(2)
  })
  it('uses one display range with a sixteen week minimum and a thirty week cap', () => {
    const max = api('getMaxTeachingWeek')
    expect(max(null)).toBe(16)
    expect(max(table())).toBe(16)
    expect(max(table({ courses: [course('长学期', { weeks: [1, 22] })] }))).toBe(22)
    expect(max({ courses: [{ weeks: [0, 1, 30, 31, 999, 2.5] }] })).toBe(30)
  })
  it('clamps the displayed current week to the timetable range before and after term', () => {
    expect(timetable.currentTeachingWeek(table(), at('2026-08-01T04:00:00Z'))).toBe(1)
    expect(timetable.currentTeachingWeek(table(), at('2027-08-01T04:00:00Z'))).toBe(16)
  })
  it('converts confirmed week/day selections into real dates without normalizing invalid values', () => {
    const date = api('calendarDateForDay')
    expect(date(table(), 1, 1)).toBe('2026-08-31')
    expect(date(table(), 2, 7)).toBe('2026-09-13')
    for (const [week, day] of [[0, 1], [17, 1], [1, 0], [1, 8], [1.5, 1]]) expect(date(table(), week, day)).toBeNull()
    expect(date(table({ dateConfirmed: false }), 1, 1)).toBeNull()
  })
  it('calibrates the chosen current week from Shanghai current Monday without altering courses', () => {
    const original = table({ termStart: '2026-08-30', dateConfirmed: false })
    const next = api('calibrateTimetable')(original, 8, at('2026-10-25T15:59:59Z'))
    expect(next).toMatchObject({ termStart: '2026-08-31', dateConfirmed: true })
    expect(next.courses).toBe(original.courses)
    expect(original).toMatchObject({ termStart: '2026-08-30', dateConfirmed: false })
    expect(Object.keys(next).sort()).toEqual(Object.keys(original).sort())
    expect(api('calibrateTimetable')(original, 9, at('2026-10-25T16:00:00Z')).termStart).toBe('2026-08-31')
  })
  it.each([0, 17, 31, 1.5, NaN, '2'])('rejects an invalid calibration week %s', (week) => {
    const calibrate = api('calibrateTimetable')
    expect(() => calibrate(table(), week, at('2026-10-25T04:00:00Z'))).toThrow()
  })
})

describe('real next class occurrences', () => {
  it('does not invent today or next class before a calendar is confirmed', () => {
    expect(api('getNextClassState')(table({ dateConfirmed: false }), at('2026-08-31T00:00:00Z'))).toEqual({ status: 'unconfirmed', date: null, courses: [] })
    expect(api('getNextClassState')(table({ termStart: '2026-08-30' }), at('2026-08-31T00:00:00Z')).status).toBe('unconfirmed')
  })
  it('shows a class before its start and treats the exact start as active', () => {
    const value = table()
    const next = api('getNextClassState')
    expect(next(value, at('2026-08-30T23:59:59Z'))).toMatchObject({ status: 'upcoming', date: '2026-08-31' })
    expect(next(value, at('2026-08-31T00:00:00Z'))).toEqual({ status: 'active', date: '2026-08-31', courses: value.courses })
  })
  it('excludes a class at the exact end and finds the next actual week occurrence', () => {
    const next = api('getNextClassState')(table(), at('2026-08-31T01:40:00Z'))
    expect(next).toMatchObject({ status: 'upcoming', date: '2026-09-07' })
    expect(next.courses.map(({ id }) => id)).toEqual(['课A'])
  })
  it('shows simultaneous active classes together without choosing one conflict for the user', () => {
    const value = table({ courses: [course('课A'), course('课B', { startTime: '08:30', endTime: '10:00' }), course('课C', { startTime: '10:00', endTime: '11:30' })] })
    expect(api('getNextClassState')(value, at('2026-08-31T00:45:00Z')).courses.map(({ id }) => id)).toEqual(['课A', '课B'])
  })
  it('shows both classes when the earliest upcoming start is shared', () => {
    const value = table({ courses: [course('课A'), course('课B'), course('晚课', { startTime: '10:00', endTime: '11:30' })] })
    expect(api('getNextClassState')(value, at('2026-08-30T22:00:00Z')).courses.map(({ id }) => id)).toEqual(['课A', '课B'])
  })
  it('finds a next-day course across a teaching week boundary', () => {
    const value = table({ courses: [course('周日', { weekday: 7, weeks: [1] }), course('周一', { weeks: [2] })] })
    expect(api('getNextClassState')(value, at('2026-09-06T04:00:00Z'))).toMatchObject({ status: 'upcoming', date: '2026-09-07', courses: [value.courses[1]] })
  })
  it('honors discrete and alternate week rules rather than repeating a skipped week', () => {
    const value = table({ courses: [course('单周课', { weeks: [1, 3, 5] })] })
    expect(api('getNextClassState')(value, at('2026-09-07T00:10:00Z'))).toMatchObject({ status: 'upcoming', date: '2026-09-14' })
  })
  it('can show the first future class before term but never returns old classes after term', () => {
    const next = api('getNextClassState')
    expect(next(table(), at('2026-08-01T04:00:00Z'))).toMatchObject({ status: 'upcoming', date: '2026-08-31' })
    expect(next(table(), at('2027-08-01T04:00:00Z'))).toEqual({ status: 'empty', date: null, courses: [] })
  })
  it('does not invent a time for unscheduled subjects or mutate source courses', () => {
    const value = table({ courses: [course('末课', { weeks: [1] })], unscheduled: [{ name: '未排课', note: '未排具体时间' }] })
    const original = JSON.stringify(value)
    expect(api('getNextClassState')(value, at('2026-09-01T04:00:00Z'))).toEqual({ status: 'empty', date: null, courses: [] })
    expect(JSON.stringify(value)).toBe(original)
  })
})

describe('account and semester view persistence', () => {
  const now = at('2026-10-25T04:00:00Z')
  const unknown = () => table({ dateConfirmed: false })
  it('reopens a confirmed calendar at Shanghai today instead of a previously browsed week', () => {
    api('saveTimetableView')('a', table(), { week: 3, weekday: 2 })
    expect(api('loadTimetableView')('a', table(), now)).toEqual({ week: 8, weekday: 7 })
  })
  it('remembers unknown-calendar browsing separately for each account, guest, and semester', () => {
    const save = api('saveTimetableView'), load = api('loadTimetableView')
    save('a', unknown(), { week: 8, weekday: 3 })
    save('b', unknown(), { week: 4, weekday: 4 })
    save(null, unknown(), { week: 2, weekday: 2 })
    expect(load('a', unknown(), now)).toEqual({ week: 8, weekday: 3 })
    expect(load('b', unknown(), now)).toEqual({ week: 4, weekday: 4 })
    expect(load(null, unknown(), now)).toEqual({ week: 2, weekday: 2 })
    expect(load('a', unknown(), now)).toEqual({ week: 8, weekday: 3 })
    expect(load('a', table({ dateConfirmed: false, semester: '2026-2027-2' }), now)).toEqual({ week: 1, weekday: 7 })
  })
  it('keeps the last valid view when an invalid selection is passed for saving', () => {
    const save = api('saveTimetableView'), load = api('loadTimetableView')
    save('a', unknown(), { week: 8, weekday: 3 })
    for (const view of [{ week: 0, weekday: 3 }, { week: 17, weekday: 3 }, { week: 8, weekday: 0 }, { week: 8, weekday: 8 }, { week: 2.5, weekday: 3 }]) save('a', unknown(), view)
    expect(load('a', unknown(), now)).toEqual({ week: 8, weekday: 3 })
  })
  it('clamps a remembered week if a replacement timetable has a shorter display range', () => {
    api('saveTimetableView')('a', table({ dateConfirmed: false, courses: [course('长学期', { weeks: [22] })] }), { week: 22, weekday: 6 })
    expect(api('loadTimetableView')('a', unknown(), now)).toEqual({ week: 16, weekday: 6 })
  })
  it('handles corrupted or blocked local storage without blocking navigation', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem: () => { throw new Error('quota') } })
    expect(api('loadTimetableView')('a', unknown(), now)).toEqual({ week: 1, weekday: 7 })
    expect(() => api('saveTimetableView')('a', unknown(), { week: 8, weekday: 3 })).not.toThrow()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    expect(api('loadTimetableView')('a', unknown(), now)).toEqual({ week: 1, weekday: 7 })
  })
  it('preserves existing unconfirmed timetable data while remembering only a separate view', () => {
    const original = table({ termStart: '2026-08-30', dateConfirmed: false })
    timetable.saveTimetable('a', original)
    api('saveTimetableView')('a', original, { week: 8, weekday: 3 })
    expect(timetable.loadTimetable('a')).toEqual(original)
  })
})
