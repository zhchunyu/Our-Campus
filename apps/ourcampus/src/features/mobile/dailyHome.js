const recentKey = owner => `ourcampus.along-recent.v1.${owner || 'guest'}`

export function loadRecentPlaces(owner, locations) {
  try {
    const ids = JSON.parse(localStorage.getItem(recentKey(owner)) || '[]')
    if (!Array.isArray(ids)) return []
    return [...new Set(ids.filter(id => typeof id === 'string'))].map(id => locations.find(place => place.id === id)).filter(Boolean).slice(0, 4)
  } catch { return [] }
}

export function rememberRecentPlace(owner, locationId, locations) {
  if (!locations.some(place => place.id === locationId)) return
  const recent = loadRecentPlaces(owner, locations).map(place => place.id)
  try { localStorage.setItem(recentKey(owner), JSON.stringify([locationId, ...recent.filter(id => id !== locationId)].slice(0, 4))) } catch { /* Viewing a place stays usable if local storage is full. */ }
}
