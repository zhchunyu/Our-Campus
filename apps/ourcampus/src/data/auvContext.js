import { ROUTE_MODES } from '../domain/route.js'
import { canUseCalendar, validTimetable } from './timetable.js'

const routeModes = new Set(Object.values(ROUTE_MODES))
const contextBytes = (context) => new TextEncoder().encode(JSON.stringify(context)).byteLength

export function buildAuvContext({ locations = [], manualLocationId = null, routePlan = null, favoriteIds, timetable = null, now = new Date() } = {}) {
  const ids = new Set(locations.map((location) => location.id))
  const context = { capturedAt: new Date(now).toISOString(), locationSource: 'unknown' }
  // A viewed place and a route origin are query state, never proof of current position.
  if (ids.has(manualLocationId)) {
    context.currentLocationId = manualLocationId
    context.locationSource = 'user_selected'
  }
  if (routePlan && ids.has(routePlan.originId) && ids.has(routePlan.destinationId) && routeModes.has(routePlan.mode)) {
    context.route = { originId: routePlan.originId, destinationId: routePlan.destinationId, mode: routePlan.mode }
  }
  if (Array.isArray(favoriteIds)) context.favoriteIds = [...new Set(favoriteIds.filter((id) => ids.has(id)))].slice(0, 100)
  if (validTimetable(timetable)) {
    context.timetable = {
      semester: timetable.semester, termStart: timetable.termStart, dateConfirmed: canUseCalendar(timetable),
      courses: timetable.courses.slice(0, 100).map(({ id, name, classroom, weekday, weeks, periods, startTime, endTime }) => ({ id, name, classroom, weekday, weeks: [...weeks], periods: [...periods], startTime, endTime })),
      unscheduled: timetable.unscheduled.map(({ name }) => ({ name })),
      truncated: timetable.truncated === true || timetable.courses.length > 100,
    }
    // Leave room for the question and bounded conversation in the 64 KB request.
    for (const list of [context.timetable.courses, context.timetable.unscheduled]) {
      while (list.length && contextBytes(context) > 40000) { list.pop(); context.timetable.truncated = true }
    }
  }
  return context
}

export function createTimetablePlanningQuestion(week) {
  if (!Number.isInteger(week) || week < 1 || week > 30) throw new Error('请选择有效的教学周')
  return `请根据我已关联的课表，规划第${week}教学周的学习和休息。按周一至周日安排；日期未校准时不要推算实际日期或当前教学周。已排课程时间不安排其他任务，未排时间或截断的课程不能当作空闲。只给建议，不宣称已保存日程。`
}
