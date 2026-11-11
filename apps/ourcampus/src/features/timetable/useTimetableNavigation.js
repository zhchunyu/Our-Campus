import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createTimetableNavigation } from './timetableNavigation.js'

export function useTimetableNavigation({ userId, timetable }) {
  const navigation = useMemo(() => createTimetableNavigation({ userId, timetable }), [userId])
  const state = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot, navigation.getSnapshot)
  useEffect(() => { navigation.updateTimetable(timetable) }, [navigation, timetable])
  useEffect(() => {
    let active = true
    const refresh = () => { if (active && document.visibilityState !== 'hidden') navigation.tick(new Date()) }
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    refresh()
    return () => {
      active = false; clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [navigation])
  return { ...state, navigation }
}
