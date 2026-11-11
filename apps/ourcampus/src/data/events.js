import { isHotspotActiveAt } from '../domain/campus.js'

const demoEventWindow = {
  startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  endAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
}

const demoEvents = [
  {
    id: 'event-library-lecture',
    title: '图书馆阅读活动',
    type: 'activity',
    locationId: 'library',
    status: 'active',
    ...demoEventWindow,
    heatLevel: 'medium',
    impact: '图书馆正在开展校园阅读活动。',
    source: 'manager',
    positionSource: 'campus-guide',
    updatedAt: '刚刚更新',
    visibleTo: ['visitor', 'student', 'manager'],
  },
  {
    id: 'event-canteen-crowd',
    title: '禾香餐厅午餐高峰',
    type: 'crowd',
    locationId: 'canteen',
    status: 'active',
    ...demoEventWindow,
    heatLevel: 'high',
    impact: '禾香餐厅当前较繁忙，建议错峰就餐。',
    source: 'manager',
    positionSource: 'campus-guide',
    updatedAt: '2 分钟前',
    visibleTo: ['visitor', 'student', 'manager'],
  },
  {
    id: 'event-sports-training',
    title: '体育场馆训练活动',
    type: 'activity',
    locationId: 'gymnasium',
    status: 'active',
    ...demoEventWindow,
    heatLevel: 'medium',
    impact: '体育场馆区域正在开展校队训练。',
    affectedEdgeIds: [],
    source: 'manager',
    positionSource: 'campus-guide',
    updatedAt: '12 分钟前',
    visibleTo: ['visitor', 'student', 'manager'],
  },
]

export const eventRepository = {
  loadAll() {
    return demoEvents.map((event) => ({
      ...event,
      visibleTo: [...event.visibleTo],
      affectedEdgeIds: [...(event.affectedEdgeIds ?? [])],
    }))
  },
}

export function getActiveBlockedEdgeIds(events = [], now = new Date()) {
  return [...new Set(events
    .filter((event) => isHotspotActiveAt(event, now))
    .flatMap((event) => event.affectedEdgeIds ?? []))]
}

export function getDefaultAffectedEdgeIds({ type, locationId }) {
  if (type !== 'construction') return []

  const locationEdges = {
    gymnasium: ['road:outer_sw3:outer_sw4'],
    'teaching-a': ['road:inner_e_s7:inner_e_s8'],
    canteen: ['road:outer_s2:outer_s3'],
  }

  return locationEdges[locationId] ?? []
}

export { demoEvents }
