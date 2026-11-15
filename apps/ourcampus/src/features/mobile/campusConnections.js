import { isRestaurantLocation } from '../../data/restaurantReviews.js'
import { getShanghaiCalendar } from '../../data/timetable.js'

const genericBuildingAliases = new Set(['教学楼', '实验楼', '主楼', '楼', '教室', '校门', '餐厅', '食堂', '操场', '校园'])
const normalizedRoom = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s()（）【】\[\]·,，:：_—–-]/g, '')
const roomSuffix = /^(?:[a-z]区)?(?:[一二三四五六七八九十\d]+[层楼])?(?:[a-z]?\d+[a-z]?)?(?:室|教室)?$/

// A building connection never resolves a room's indoor position. Broad aliases
// and partial names require an explicit choice, even if only one happens to exist.
export function resolveCourseLocation(room, locations = []) {
  const value = normalizedRoom(room)
  const candidates = value ? locations.filter(location => {
    if (!location?.id || !location.name) return false
    const aliases = (Array.isArray(location.aliases) ? location.aliases : []).filter(alias => !genericBuildingAliases.has(normalizedRoom(alias)))
    return [location.name, ...aliases].some(name => {
      const token = normalizedRoom(name)
      return token.length >= 2 && value.startsWith(token) && roomSuffix.test(value.slice(token.length))
    })
  }) : []
  return { status: candidates.length === 1 ? 'matched' : candidates.length > 1 ? 'ambiguous' : 'unmatched', locationId: candidates.length === 1 ? candidates[0].id : null, candidates }
}

export function getCampusRestaurants(locations = [], query = '') {
  const term = String(query).trim().toLocaleLowerCase()
  return locations.filter(location => isRestaurantLocation(location) && [location.name, location.description, ...(location.aliases ?? [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(term))
}

export function openCampusRestaurant(locationId, locations = [], onOpenRestaurantReviews) {
  if (typeof onOpenRestaurantReviews !== 'function' || !locations.some(location => location.id === locationId && isRestaurantLocation(location))) return false
  onOpenRestaurantReviews(locationId)
  return true
}

export function selectCampusEvents(events = [], { intent = 'date', date, now = new Date() } = {}) {
  const current = new Date(now).getTime()
  const today = getShanghaiCalendar(now)?.date
  return events.filter(event => {
    if (event.type !== 'activity' || !Number.isFinite(Date.parse(event.startAt))) return false
    const start = Date.parse(event.startAt), end = Date.parse(event.endAt)
    const ended = event.status === 'closed' || (Number.isFinite(end) && end >= start && end <= current)
    if (intent === 'past') return ended
    if (intent === 'upcoming') return !ended && (start >= current || (Number.isFinite(end) ? end > current : getShanghaiCalendar(event.startAt)?.date === today))
    const first = getShanghaiCalendar(event.startAt)?.date
    const last = Number.isFinite(end) && end >= start ? getShanghaiCalendar(new Date(end - 1))?.date : first
    return Boolean(date && first && date >= first && date <= last)
  }).sort((left, right) => intent === 'past' ? Date.parse(right.startAt) - Date.parse(left.startAt) : Date.parse(left.startAt) - Date.parse(right.startAt))
}
