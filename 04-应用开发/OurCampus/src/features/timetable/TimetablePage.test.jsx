import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('react-dom', () => ({ createPortal: (content) => content }))
vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {} }))
import { TimetablePage } from './TimetablePage.jsx'
const course = { id: 'math', name: '高等数学', teacher: '任课教师', classroom: '教学楼201', weekday: 1, weeks: [9], periods: [1, 2], startTime: '08:00', endTime: '09:40' }
const timetable = { version: 1, semester: '2026-2027-1', termStart: '2026-08-31', dateConfirmed: true, courses: [course], unscheduled: [] }
let values
const render = () => renderToStaticMarkup(<TimetablePage userId="member-a" onClose={() => {}} onAskAi={() => {}} />)
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T23:00:00Z'))
  values = new Map([['campus-twin-timetable-v1:member-a', JSON.stringify(timetable)]])
  vi.stubGlobal('localStorage', { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
  vi.stubGlobal('document', { body: {} })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('daily timetable first screen', () => {
  it('puts the next scheduled class and its classroom before the daily timeline', () => {
    const html = render()
    expect(html).toContain('下一节课')
    expect(html).toContain('高等数学')
    expect(html).toContain('教学楼201')
    expect(html).toContain('回今天')
    expect(html).not.toContain('本学期的学习安排')
  })
  it('asks for a current-week calibration rather than inventing today classes', () => {
    values.set('campus-twin-timetable-v1:member-a', JSON.stringify({ ...timetable, termStart: '2026-08-30', dateConfirmed: false }))
    const html = render()
    expect(html).toContain('现在是第几教学周')
    expect(html).toContain('先校准教学周')
    expect(html).not.toContain('下一节课</')
    expect(html).not.toContain('今天的课程')
  })
  it('offers meaningful empty and import states without pretending anything is synchronized', () => {
    values.clear()
    const html = render()
    expect(html).toContain('导入课表')
    expect(html).not.toContain('云端课表')
    expect(html).not.toContain('下一节课')
  })
})

it('never calls a clamped historical week the current week in settings', () => {
  vi.setSystemTime(new Date('2027-08-01T04:00:00Z'))
  const html = render()
  expect(html).toContain('超出课表周次范围')
  expect(html).not.toContain('学期已结束')
  expect(html).not.toContain('当前第 16 教学周')
})
