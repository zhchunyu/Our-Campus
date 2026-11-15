import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasHome } from './CanvasHome.jsx'
import { savePersonalHome } from '../../data/personalHome.js'
import { saveTimetable } from '../../data/timetable.js'

const locations = [{ id: 'library', name: '图书馆' }, { id: 'canteen', name: '谷园餐厅' }, { id: 'learning', name: '崇学楼' }]
const course = { id: 'math', name: '高等数学', teacher: '老师', classroom: '崇学楼203', weekday: 1, weeks: [2], periods: [1, 2], startTime: '08:00', endTime: '09:40' }
const timetable = { version: 1, semester: '2026-2027-1', courses: [course], unscheduled: [], termStart: '2026-11-09', dateConfirmed: true }
const render = (userId = 'student-a', props = {}) => renderToStaticMarkup(<CanvasHome auth={{ user: userId ? { id: userId } : null }} locations={locations} events={[]} {...props} />)

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T04:00:00Z'))
  const values = new Map()
  vi.stubGlobal('localStorage', { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Along daily home', () => {
  it('keeps private decorative covers off the daily task surface', () => {
    const privateImage = 'data:image/jpeg;base64,YWJj'
    savePersonalHome('student-a', { cover: privateImage })
    const html = render()
    expect(html).not.toContain(privateImage)
    expect(html).toContain('校园地点预览')
    expect(html).toContain('搜地点、餐厅或办事')
  })
  it('shows the next scheduled course across the Sunday/Monday boundary', () => {
    saveTimetable('student-a', timetable)
    const html = render()
    expect(html).toContain('高等数学')
    expect(html).toContain('08:00')
    expect(html).toContain('11/16')
    expect(html).toContain('崇学楼203')
    expect(html).toContain('找教室')
  })
  it('does not show a previous account course to another account or guest', () => {
    saveTimetable('student-a', timetable)
    for (const user of ['student-b', null]) {
      const html = render(user)
      expect(html).not.toContain('高等数学')
      expect(html).toContain('导入课表')
    }
  })
  it('asks for calibration instead of pretending an unconfirmed calendar has no classes', () => {
    saveTimetable('student-a', { ...timetable, dateConfirmed: false })
    const html = render()
    expect(html).toContain('校准教学周')
    expect(html).not.toContain('今天无课')
    expect(html).not.toContain('08:00')
  })
  it('does not invent a next course after the last scheduled occurrence', () => {
    saveTimetable('student-a', { ...timetable, courses: [{ ...course, weeks: [1] }] })
    const html = render()
    expect(html).toContain('暂无后续课表安排')
    expect(html).not.toContain('今天无课')
  })
  it('keeps demo events out of the real home activity feed', () => {
    const base = { status: 'active', startAt: '2026-11-15T03:00:00Z', endAt: '2026-11-16T03:00:00Z' }
    const html = render('student-a', { events: [{ ...base, id: 'demo', title: '不是真实活动', isDemo: true }, { ...base, id: 'real', title: '正式发布活动', isCloud: true }] })
    expect(html).not.toContain('不是真实活动')
    expect(html).toContain('正式发布活动')
  })
})