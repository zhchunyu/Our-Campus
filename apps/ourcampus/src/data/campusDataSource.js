function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeSnapshot(locations, events) {
  return {
    locations: clone(locations),
    events: clone(events),
    lastSyncedAt: '刚刚更新',
  }
}

export function createLocalCampusDataSource({ locations = [], events = [] } = {}) {
  let snapshot = makeSnapshot(locations, events)
  const listeners = new Set()

  function publishSnapshot(nextSnapshot) {
    snapshot = nextSnapshot
    const result = clone(snapshot)
    listeners.forEach((listener) => listener(result))
    return result
  }

  return {
    loadSnapshot() {
      return clone(snapshot)
    },

    updateLocation(id, patch) {
      return publishSnapshot({
        ...snapshot,
        locations: snapshot.locations.map((location) => (
          location.id === id ? { ...location, ...patch, updatedAt: '刚刚更新' } : location
        )),
      })
    },

    publishEvent(event) {
      return publishSnapshot({
        ...snapshot,
        events: [...snapshot.events, { ...event, updatedAt: '刚刚更新' }],
      })
    },

    closeEvent(id) {
      return publishSnapshot({
        ...snapshot,
        events: snapshot.events.map((event) => (
          event.id === id ? { ...event, status: 'closed', updatedAt: '刚刚更新' } : event
        )),
      })
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
