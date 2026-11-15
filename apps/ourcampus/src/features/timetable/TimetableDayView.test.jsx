import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextClassCard, TimetableDayView, TimetableWeekNavigation, CourseLocationControl } from './TimetableDayView.jsx'
const course = { id: 'math', name: '高等数学', teacher: '任课教师', classroom: '教学楼201', weekday: 1, weeks: [9], periods: [1, 2], startTime: '08:00', endTime: '09:40' }
const timetable = { version: 1, semester: '2026-2027-1', termStart: '2026-08-31', dateConfirmed: true, courses: [course], unscheduled: [] }
const monday = new Date('2026-10-26T01:00:00Z')
const render = element => renderToStaticMarkup(element)
const next = (table = timetable, now = monday) => render(<NextClassCard timetable={table} now={now} onCalibrate={() => {}} onShowDay={() => {}} />)
const nav = (table = timetable, now = monday, week = 9) => render(<TimetableWeekNavigation timetable={table} now={now} week={week} weekday={1} onWeek={() => {}} onDay={() => {}} onToday={() => {}} />)

describe('daily course presentation from real calendar occurrences', () => {
  it('shows every concurrent class and a conflict rather than arbitrarily choosing one', () => {
    const html = next({ ...timetable, courses: [course, { ...course, id: 'english', name: '大学英语', classroom: '教学楼302', startTime: '08:30' }] })
    expect(html).toContain('正在上课')
    expect(html).toContain('高等数学')
    expect(html).toContain('大学英语')
    expect(html).toContain('教学楼302')
    expect(html).toContain('时间重叠')
  })
  it('marks tomorrow using the occurrence date rather than the selected navigation week', () => {
    const html = next({ ...timetable, courses: [{ ...course, weekday: 2 }] })
    expect(html).toContain('下一节课')
    expect(html).toContain('明天')
    expect(html).not.toContain('今天')
  })
  it('does not reuse last semester classes as a next class or call its clamped week current', () => {
    const after = new Date('2027-08-01T04:00:00Z')
    expect(next(timetable, after)).toContain('没有更多已排课程')
    const html = nav(timetable, after, 16)
    expect(html).toContain('已超出这份课表的周次范围')
    expect(html).not.toContain('学期已结束')
    expect(html).toContain('回课表')
    expect(html).not.toContain('回今天')
    expect(html).not.toContain('aria-current="date"')
  })
  it('shows pre-term dates truthfully and highlights today only when the exact calendar date matches', () => {
    const before = nav(timetable, new Date('2026-08-20T04:00:00Z'), 1)
    expect(before).toContain('尚未到这份课表的第1周')
    expect(before).not.toContain('学期尚未开始')
    expect(before).not.toContain('aria-current="date"')
    const current = nav()
    expect(current.match(/aria-current="date"/g)).toHaveLength(1)
    expect(current).toContain('周一，10月26日，1门课')
    const unknown = nav({ ...timetable, dateConfirmed: false })
    expect(unknown).toContain('日期待校准')
    expect(unknown).not.toContain('aria-current="date"')
  })
  it('labels a course at its end time finished and never titles an arbitrary browsed day today', () => {
    const ended = render(<TimetableDayView timetable={timetable} week={9} weekday={1} now={new Date('2026-10-26T01:40:00Z')} />)
    expect(ended).toContain('今天的课程')
    expect(ended).toContain('已结束')
    expect(ended).not.toContain('进行中')
    const past = render(<TimetableDayView timetable={timetable} week={8} weekday={1} now={monday} />)
    expect(past).not.toContain('今天的课程')
    expect(past).toContain('10月19日')
  })
  it('does not imply that an empty day is completely free when unscheduled courses exist', () => {
    const table = { ...timetable, unscheduled: [{ name: '实验', note: '时间待定' }] }
    const html = render(<TimetableDayView timetable={table} week={9} weekday={3} now={monday} />)
    expect(html).toContain('这天没有已排课程')
    expect(html).not.toContain('今天空闲')
    expect(next(table)).toContain('另有 1 门课程未排时间')
  })
})

describe('course to campus building', () => {
  const locations = [{ id: 'teaching-a', name: '崇学楼', category: 'learning' }, { id: 'library', name: '图书馆', category: 'learning' }]
  const known = { ...course, classroom: '崇学楼203' }
  it('keeps the original room and offers its real building in next and day course views', () => {
    const props = { locations, onSelectLocation: () => {} }
    const table = { ...timetable, courses: [known] }
    for (const html of [render(<NextClassCard timetable={table} now={monday} {...props} />), render(<TimetableDayView timetable={table} week={9} weekday={1} now={monday} {...props} />)]) {
      expect(html).toContain('崇学楼203')
      expect(html).toContain('找教室')
      expect(html).toContain('室内位置请核对')
    }
  })
  it('selects only the matched building ID when the course action is used', () => {
    const selected = []
    const element = CourseLocationControl({ course: known, locations, onSelectLocation: id => selected.push(id) })
    element.props.children[0].props.onClick()
    expect(selected).toEqual(['teaching-a'])
  })
  it('requires an explicit building selection for an unknown room and never overwrites that room', () => {
    const unknown = { ...course, classroom: '201（教务待确认）' }
    const html = render(<TimetableDayView timetable={{ ...timetable, courses: [unknown] }} week={9} weekday={1} now={monday} locations={locations} onSelectLocation={() => {}} />)
    expect(html).toContain('201（教务待确认）')
    expect(html).toContain('选择上课建筑')
    expect(html).toContain('无法可靠匹配建筑')
    expect(html).toContain('请选择校园建筑')
    expect(html).not.toContain('找教室')
  })
  it('keeps legacy callers readable without offering an unavailable campus action', () => {
    const html = render(<TimetableDayView timetable={timetable} week={9} weekday={1} now={monday} />)
    expect(html).toContain('教学楼201')
    expect(html).not.toContain('选择上课建筑')
  })
})
