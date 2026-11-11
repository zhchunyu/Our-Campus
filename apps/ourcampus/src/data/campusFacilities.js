import { getTencentCampusPosition } from './tencentCampusGeo.js'

export function calculateStraightDistance(from, to) {
  if (!from || !to || ![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)
    || [from.lat, to.lat].some((lat) => Math.abs(lat) > 90) || [from.lng, to.lng].some((lng) => Math.abs(lng) > 180)) return null
  const radians = Math.PI / 180
  const dLat = (to.lat - from.lat) * radians
  const dLng = (to.lng - from.lng) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(dLng / 2) ** 2
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))))
}

export function listCampusFacilities(locations, contributions = [], origin = null, type = 'all', query = '') {
  const knownFacilities = locations.flatMap((location) => {
    let facilityType = null
    if (location.category === 'dining' && /餐厅/.test(location.name)) facilityType = 'food'
    else if (location.id === 'hospital') facilityType = 'medical'
    else if (['gymnasium', 'sports-ground', 'ball-court', 'swimming-pool', 'ruizhi-sports-center'].includes(location.id)) facilityType = 'sports'
    return facilityType ? [{ id: `campus-${location.id}`, locationId: location.id, type: facilityType, name: location.name, detail: '校园地图已有地点，开放时间以现场公告为准。', source: 'campus-map' }] : []
  })
  const locationById = new Map(locations.map((location) => [location.id, location]))
  const term = query.trim().toLowerCase()
  return [...knownFacilities, ...contributions.filter((item) => item.status === 'verified').map((item) => ({ ...item, source: 'local-contribution' }))]
    .filter((item) => locationById.has(item.locationId) && (type === 'all' || item.type === type))
    .map((item) => {
      const location = locationById.get(item.locationId)
      return { ...item, locationName: location.name, distance: calculateStraightDistance(origin, getTencentCampusPosition(location)) }
    })
    .filter((item) => [item.name, item.detail, item.locationName].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, 'zh-CN'))
}
