import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react'
import { campusDisplayText } from '../../data/campusPresentation.js'
import { calendarDateForDay, canUseCalendar, coursesForWeek, dateAnchor, DAY_NAMES, getMaxTeachingWeek, getNextClassState, getShanghaiCalendar, weekStartLabel } from '../../data/timetable.js'

export function calendarLabel(date) {
  const value = dateAnchor(date)
  return value ? `${value.getUTCMonth() + 1}月${value.getUTCDate()}日` : ''
}
function occurrenceLabel(date, now) {
  const today = getShanghaiCalendar(now)?.date
  if (date === today) return '今天'
  const tomorrow = dateAnchor(today)
  tomorrow?.setUTCDate(tomorrow.getUTCDate() + 1)
  if (date === tomorrow?.toISOString().slice(0, 10)) return '明天'
  const day = dateAnchor(date)
  return `${calendarLabel(date)} ${DAY_NAMES[(day?.getUTCDay() + 6) % 7] || ''}`
}

export function getTermPosition(timetable, now) {
  if (!canUseCalendar(timetable)) return 'unknown'
  const today = getShanghaiCalendar(now)?.date
  const first = calendarDateForDay(timetable, 1, 1)
  const last = calendarDateForDay(timetable, getMaxTeachingWeek(timetable), 7)
  if (!today || !first || !last) return 'unknown'
  return today < first ? 'before' : today > last ? 'after' : 'within'
}

export function NextClassCard({ timetable, now, onCalibrate, onShowDay }) {
  const next = getNextClassState(timetable, now)
  if (next.status === 'unconfirmed') return <section className="timetable-next timetable-next--setup" aria-label="教学周待校准"><span className="timetable-next__eyebrow"><CalendarDays size={16} />让课表跟上今天</span><h2>先校准教学周</h2><p>确认现在第几周，就能自动显示当天安排和下一节课。未校准时会记住你上次查看的位置。</p><button type="button" onClick={onCalibrate}>校准教学周</button></section>
  if (next.status === 'empty') return <section className="timetable-next timetable-next--empty" aria-label="后续已排课程"><span className="timetable-next__eyebrow"><CalendarDays size={16} />接下来的安排</span><h2>没有更多已排课程</h2><p>当前课表中没有尚未结束的课程。临时调课和未排时间的课程仍需核对。</p></section>
  return <section className={`timetable-next${next.status === 'active' ? ' timetable-next--active' : ''}`} aria-label={next.status === 'active' ? '正在上的课' : '下一节课'}>
    <div className="timetable-next__top"><span className="timetable-next__eyebrow"><Clock3 size={15} />{next.status === 'active' ? '正在上课' : '下一节课'}</span><span className="timetable-next__date">{occurrenceLabel(next.date, now)}</span></div>
    {next.courses.map(course => <div className="timetable-next__course" key={course.id}><h2>{campusDisplayText(course.name)}</h2><p><strong>{course.startTime}–{course.endTime}</strong><span>第 {course.periods[0]}–{course.periods[1]} 节</span></p><div><MapPin size={15} /><span>{campusDisplayText(course.classroom || '教室待确认')}</span></div></div>)}
    {next.courses.length > 1 && <p className="timetable-next__conflict">这几门课时间重叠，请核对课程安排。</p>}
    <button type="button" className="timetable-next__link" onClick={() => onShowDay?.(next.date, next.courses[0]?.weekday)}>查看这天课表 <ChevronRight size={15} /></button>
    {timetable.unscheduled.length > 0 && <small>另有 {timetable.unscheduled.length} 门课程未排时间，请在课表设置中核对。</small>}
  </section>
}

export function TimetableWeekNavigation({ timetable, week, weekday, now, onWeek, onDay, onToday, preview = false }) {
  const maxWeek = getMaxTeachingWeek(timetable)
  const today = getShanghaiCalendar(now)?.date
  const position = getTermPosition(timetable, now)
  const outside = position === 'before' || position === 'after'
  return <div className="timetable-calendar-nav">
    <nav className="timetable-week" aria-label="选择教学周"><button type="button" disabled={week <= 1} aria-label="上一教学周" onClick={() => onWeek(week - 1)}><ChevronLeft size={19} /></button><div><select aria-label="教学周" value={week} onChange={event => onWeek(Number(event.target.value))}>{Array.from({ length: maxWeek }, (_, i) => <option value={i + 1} key={i + 1}>第 {i + 1} 周</option>)}</select><span>{canUseCalendar(timetable) ? weekStartLabel(timetable, week) : '查看周次 · 日期待校准'}</span></div><button type="button" disabled={week >= maxWeek} aria-label="下一教学周" onClick={() => onWeek(week + 1)}><ChevronRight size={19} /></button><button type="button" className="timetable-today" disabled={preview || !canUseCalendar(timetable)} onClick={onToday}>{outside ? '回课表' : '回今天'}</button></nav>
    {outside && <p className="timetable-term-note" role="status">{position === 'before' ? '尚未到这份课表的第1周，以下为已排课程' : '当前日期已超出这份课表的周次范围，正在查看历史安排'}</p>}
    <nav className="timetable-days" aria-label="选择星期">{DAY_NAMES.map((day, index) => {
      const date = calendarDateForDay(timetable, week, index + 1)
      const count = coursesForWeek(timetable, week).filter(course => course.weekday === index + 1).length
      return <button type="button" key={day} aria-pressed={weekday === index + 1} aria-current={date && date === today ? 'date' : undefined} className={date && date === today ? 'is-today' : ''} onClick={() => onDay(index + 1)} aria-label={`${day}${date ? `，${calendarLabel(date)}` : ''}，${count}门课`}><span>{day.slice(1)}</span><strong>{date ? Number(date.slice(-2)) : '—'}</strong><i aria-hidden="true" className={count ? 'has-course' : ''} /></button>
    })}</nav>
  </div>
}

export function TimetableDayView({ timetable, week, weekday, now, conflicts = new Set() }) {
  const date = calendarDateForDay(timetable, week, weekday)
  const today = getShanghaiCalendar(now)
  const courses = coursesForWeek(timetable, week).filter(course => course.weekday === weekday)
  const isToday = date && date === today?.date
  return <section className="timetable-day" aria-label="当天课程"><header><div><h2>{isToday ? '今天的课程' : `${date ? calendarLabel(date) + ' · ' : ''}${DAY_NAMES[weekday - 1]}`}</h2><p>{date ? (isToday ? '按当前课表安排' : `第 ${week} 教学周`) : `查看第 ${week} 教学周，日历日期待校准`}</p></div><span>{courses.length} 门课</span></header>
    {courses.length ? <div className="timetable-timeline">{courses.map(course => {
      const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
      const state = isToday ? (today.minutes >= minutes(course.endTime) ? 'ended' : today.minutes >= minutes(course.startTime) ? 'active' : 'later') : date && date < today?.date ? 'ended' : ''
      return <article className={`timetable-course${conflicts.has(course.id) ? ' is-conflict' : ''}${state ? ` is-${state}` : ''}`} key={course.id}><div className="timetable-course-time"><strong>{course.startTime}</strong><span>{course.endTime}</span><small>{course.periods[0]}–{course.periods[1]} 节</small></div><div className="timetable-course-copy"><div className="timetable-course-heading"><h3>{campusDisplayText(course.name)}</h3>{state && <span className="timetable-course-state">{state === 'active' ? '进行中' : state === 'ended' ? '已结束' : '待上课'}</span>}</div><p><MapPin size={13} />{campusDisplayText(course.classroom || '教室待确认')}</p>{course.teacher && <span>{campusDisplayText(course.teacher)}</span>}{conflicts.has(course.id) && <small className="timetable-course-conflict">时间有重叠，请核对</small>}</div></article>
    })}</div> : <div className="timetable-day-empty"><CalendarDays size={28} strokeWidth={1.4} /><strong>这天没有已排课程</strong><p>可以切换日期查看安排。临时调课请以教务通知为准。</p></div>}
  </section>
}
