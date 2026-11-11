import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from './appSettings.js'
import { loadPersistedState, savePersistedState } from './appStorage.js'
import { eventRepository } from './events.js'
import { locationRepository } from './locations.js'

afterEach(() => vi.unstubAllGlobals())

function storageWith(value) {
  const values = new Map([[SETTINGS_STORAGE_KEY, value]])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, nextValue) => values.set(key, nextValue),
    values,
  }
}

describe('persisted app state', () => {
  it('migrates a valid legacy snapshot without a schema version', () => {
    const storage = storageWith(JSON.stringify({ events: [], locations: [] }))
    vi.stubGlobal('localStorage', storage)

    expect(loadPersistedState()).toMatchObject({ schemaVersion: 3, events: [], locations: [], placeFeedback: [], favoriteLocationIds: [], savedRoutes: [] })
  })

  it('rejects snapshots with malformed event records', () => {
    const storage = storageWith(JSON.stringify({ events: [null] }))
    vi.stubGlobal('localStorage', storage)

    expect(loadPersistedState()).toBeNull()
  })

  it('rejects snapshots from a newer unsupported schema', () => {
    const storage = storageWith(JSON.stringify({ schemaVersion: 4, events: [] }))
    vi.stubGlobal('localStorage', storage)

    expect(loadPersistedState()).toBeNull()
  })

  it('writes the current schema version with saved state', () => {
    const storage = storageWith(null)
    vi.stubGlobal('localStorage', storage)

    savePersistedState({ locations: [], events: [], settings: {}, adminHistory: [] })

    expect(JSON.parse(storage.values.get(SETTINGS_STORAGE_KEY))).toMatchObject({ schemaVersion: 3, placeFeedback: [], favoriteLocationIds: [], savedRoutes: [] })
  })

  it('accepts the current repository snapshot on the next load', () => {
    const storage = storageWith(null)
    vi.stubGlobal('localStorage', storage)
    const locations = locationRepository.loadAll()
    const events = eventRepository.loadAll()

    savePersistedState({ locations, events, settings: {}, adminHistory: [], role: 'visitor' })

    expect(loadPersistedState()).toMatchObject({
      schemaVersion: 3,
      locations: expect.arrayContaining([expect.objectContaining({ id: 'library' })]),
      events: expect.arrayContaining([expect.objectContaining({ id: 'event-library-lecture' })]),
    })
  })
})
