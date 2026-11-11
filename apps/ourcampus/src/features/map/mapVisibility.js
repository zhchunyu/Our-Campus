export function projectVisibleMapContent({ visibleLocations = [], events = [], settings = {} }) {
  const visibleLocationIds = new Set(visibleLocations.map((location) => location.id))
  const activeEvents = events.filter((event) => event?.status === 'active')
  const visibleEvents = settings.showHotspots
    ? activeEvents.filter((event) => visibleLocationIds.has(event.locationId))
    : []

  return { visibleLocationIds, activeEvents, visibleEvents }
}
