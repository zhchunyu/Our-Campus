import { canUseCalendar, getMaxTeachingWeek, loadTimetableView, saveTimetableView } from '../../data/timetable.js'

const calendarKey = timetable => timetable ? `${timetable.semester}:${timetable.termStart}:${timetable.dateConfirmed}` : ''

export function createTimetableNavigation({ userId, timetable = null, now = new Date() }) {
  let source = timetable
  let restore = null
  let snapshot = { ...loadTimetableView(userId, source, now), now: new Date(now), preview: null, followingToday: canUseCalendar(source) }
  const listeners = new Set()
  const emit = changes => {
    snapshot = { ...snapshot, ...changes }
    listeners.forEach(listener => listener())
  }
  const remember = () => { if (!snapshot.preview && source) saveTimetableView(userId, source, { week: snapshot.week, weekday: snapshot.weekday }) }
  const clamp = (week, value = snapshot.preview || source) => Math.max(1, Math.min(getMaxTeachingWeek(value), Number(week) || 1))
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    updateTimetable(next, { reset = false } = {}) {
      const changed = calendarKey(source) !== calendarKey(next)
      source = next
      if (snapshot.preview) return
      if (changed || reset) emit({ ...loadTimetableView(userId, source, snapshot.now), followingToday: canUseCalendar(source) })
      else if (snapshot.week !== clamp(snapshot.week)) emit({ week: clamp(snapshot.week) })
    },
    selectWeek(week) { emit({ week: clamp(week), followingToday: false }); remember() },
    selectDay(weekday) {
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return
      emit({ weekday, followingToday: false }); remember()
    },
    goToday() {
      if (snapshot.preview || !canUseCalendar(source)) return
      emit({ ...loadTimetableView(userId, source, snapshot.now), followingToday: true }); remember()
    },
    tick(now = new Date()) {
      const current = new Date(now)
      if (!Number.isFinite(current.getTime())) return
      emit({ now: current, ...(!snapshot.preview && snapshot.followingToday && canUseCalendar(source) ? loadTimetableView(userId, source, current) : {}) })
    },
    startPreview(preview) {
      if (!snapshot.preview) restore = { week: snapshot.week, weekday: snapshot.weekday, followingToday: snapshot.followingToday }
      emit({ preview, week: 1, weekday: 1, followingToday: false })
    },
    cancelPreview() {
      if (!snapshot.preview) return
      const view = restore?.followingToday && canUseCalendar(source) ? loadTimetableView(userId, source, snapshot.now) : { week: clamp(restore?.week, source), weekday: restore?.weekday || 1 }
      emit({ ...view, preview: null, followingToday: Boolean(restore?.followingToday && canUseCalendar(source)) })
      restore = null
    },
    commit(next) {
      source = next; restore = null
      emit({ ...loadTimetableView(userId, next, snapshot.now), preview: null, followingToday: canUseCalendar(next) })
    },
  }
}
