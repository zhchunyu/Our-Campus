import {
  CATEGORIES,
  CATEGORY_LABELS,
  HOTSPOT_TYPE_LABELS,
} from './campus.js'

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function textValues(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => typeof value === 'string' ? value : value?.name ?? value?.title ?? '')
    .filter(Boolean)
}

function matchScore(value, query) {
  const candidate = normalize(value)
  if (!candidate || !candidate.includes(query)) return null
  if (candidate === query) return 0
  if (candidate.startsWith(query)) return 1
  return 2
}

function bestFieldMatch(query, fields) {
  return fields.reduce((best, field) => {
    const score = matchScore(field.value, query)
    if (score === null || (best && score >= best.score)) return best
    return { ...field, score }
  }, null)
}

export function searchCampusResources(query, { locations = [], events = [], category = CATEGORIES.ALL } = {}) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  const locationsById = new Map(locations.map((location) => [location.id, location]))
  const results = []

  locations.forEach((location) => {
    if (category !== CATEGORIES.ALL && location.category !== category) return

    const fields = [
      { value: location.name, kind: 'location', label: '地点' },
      ...textValues(location.aliases).map((value) => ({ value, kind: 'location', label: '别名' })),
      ...textValues(location.pinyin).map((value) => ({ value, kind: 'location', label: '拼音' })),
      ...textValues(location.services).map((value) => ({ value, kind: 'service', label: '服务' })),
      ...textValues(location.activity).map((value) => ({ value, kind: 'activity', label: '校园动态' })),
      ...textValues(location.keywords).map((value) => ({ value, kind: 'service', label: '关键词' })),
      { value: location.description, kind: 'location', label: CATEGORY_LABELS[location.category] ?? '校园地点' },
    ]
    const match = bestFieldMatch(normalizedQuery, fields)
    if (!match) return

    results.push({
      id: `location:${location.id}`,
      kind: match.kind,
      locationId: location.id,
      title: location.name,
      subtitle: `${match.label} · ${match.value}`,
      score: match.score,
    })
  })

  events.forEach((event) => {
    const location = locationsById.get(event.locationId)
    if (!location || (category !== CATEGORIES.ALL && location.category !== category)) return

    const match = bestFieldMatch(normalizedQuery, [
      { value: event.title, label: '校园热点' },
      { value: event.impact, label: HOTSPOT_TYPE_LABELS[event.type] ?? '校园动态' },
      { value: HOTSPOT_TYPE_LABELS[event.type], label: '事件类型' },
    ])
    if (!match) return

    results.push({
      id: `event:${event.id}`,
      kind: 'event',
      locationId: location.id,
      title: event.title,
      subtitle: `${match.label} · ${location.name}`,
      score: match.score,
    })
  })

  return results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, 'zh-CN'))
}
