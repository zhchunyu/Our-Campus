export const ROLES = Object.freeze({
  VISITOR: 'visitor',
  STUDENT: 'student',
  MANAGER: 'manager',
})

export const CATEGORIES = Object.freeze({
  ALL: 'all',
  LEARNING: 'learning',
  DINING: 'dining',
  LIVING: 'living',
  SERVICE: 'service',
  TRANSPORT: 'transport',
})

export const OPEN_STATUS = Object.freeze({
  OPEN: 'open',
  LIMITED: 'limited',
  CLOSED: 'closed',
})

export const CROWD_STATUS = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  BUSY: 'busy',
})

export const HOTSPOT_TYPES = Object.freeze({
  ACTIVITY: 'activity',
  CROWD: 'crowd',
  NOTICE: 'notice',
  CLOSURE: 'closure',
  CONSTRUCTION: 'construction',
})

export const HOTSPOT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SCHEDULED: 'scheduled',
  CLOSED: 'closed',
})

export const CATEGORY_LABELS = Object.freeze({
  all: '全部地点',
  learning: '教学学习',
  dining: '餐饮生活',
  living: '住宿空间',
  service: '校园服务',
  transport: '出行节点',
})

export const ROLE_LABELS = Object.freeze({
  visitor: '访客',
  student: '学生',
  manager: '管理者',
})

export const OPEN_STATUS_LABELS = Object.freeze({
  open: '开放',
  limited: '部分开放',
  closed: '暂时关闭',
})

export const CROWD_STATUS_LABELS = Object.freeze({
  low: '人流较少',
  normal: '人流一般',
  busy: '当前拥挤',
})

export const HOTSPOT_TYPE_LABELS = Object.freeze({
  activity: '校园活动',
  crowd: '人流热点',
  notice: '校园通知',
  closure: '临时关闭',
  construction: '施工提醒',
})

export function filterLocations(locations, query = '', category = CATEGORIES.ALL) {
  const normalizedQuery = query.trim().toLowerCase()

  return locations.filter((location) => {
    const matchesCategory = category === CATEGORIES.ALL || location.category === category
    if (!matchesCategory) return false
    if (!normalizedQuery) return true

    const searchText = [location.name, ...(location.aliases ?? []), location.description, ...location.keywords]
      .join(' ')
      .toLowerCase()

    return searchText.includes(normalizedQuery)
  })
}

export function canManage(role) {
  return role === ROLES.MANAGER
}

export function canPublishEvents(role) {
  return role === ROLES.MANAGER
}

export function filterHotspots(events, filters = {}) {
  return events.filter((event) => {
    if (filters.locationId && event.locationId !== filters.locationId) return false
    if (filters.type && event.type !== filters.type) return false
    if (filters.status && event.status !== filters.status) return false
    return true
  })
}

export function isHotspotActiveAt(event, now = new Date()) {
  const timestamp = new Date(now).getTime()
  if (!Number.isFinite(timestamp) || event?.status !== HOTSPOT_STATUS.ACTIVE) return false

  const startTime = event.startAt ? new Date(event.startAt).getTime() : Number.NEGATIVE_INFINITY
  const endTime = event.endAt ? new Date(event.endAt).getTime() : Number.POSITIVE_INFINITY
  const starts = startTime <= timestamp
  const notEnded = endTime > timestamp

  return starts && notEnded
}

export function listActiveHotspots(events, now = new Date()) {
  return events.filter((event) => isHotspotActiveAt(event, now))
}
