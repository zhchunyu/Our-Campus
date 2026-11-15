import { getTencentCampusPosition } from '../../data/tencentCampusGeo.js'

export function validRouteOrigin(id, locations) {
  return typeof id === 'string' && Boolean(id) && locations.some(place => place.id === id)
}

export function nearbyRouteOrigins(position, locations, now = Date.now()) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180
    || !Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > 150
    || !Number.isFinite(position.timestamp) || now - position.timestamp > 120000 || position.timestamp > now + 5000) return []
  const radians = value => value * Math.PI / 180
  return locations.map(place => {
    const target = getTencentCampusPosition(place)
    if (!target) return null
    const a = Math.sin(radians(target.lat - position.lat) / 2) ** 2 + Math.cos(radians(position.lat)) * Math.cos(radians(target.lat)) * Math.sin(radians(target.lng - position.lng) / 2) ** 2
    const distance = Math.round(6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a))))
    return distance <= 800 ? { place, distance } : null
  }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 3)
}
