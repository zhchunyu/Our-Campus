import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from './appSettings.js'
import { loadPersistedState, savePersistedState, loadPersonalRecords, savePersonalRecords } from './appStorage.js'
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

describe('account-scoped local collections', () => {
  const route = { id: 'route-a', originId: 'library', destinationId: 'canteen', mode: 'shortest', createdAt: '2026-11-15T00:00:00Z' }
  const legacy = { schemaVersion: 3, locations: [], events: [], placeFeedback: [], favoriteLocationIds: ['library'], savedRoutes: [route] }

  it('keeps legacy device records available to guests without assigning them to a signed-in account', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify(legacy)))
    expect(loadPersonalRecords(null)).toMatchObject({ ownerId: null, scope: 'device', favoriteLocationIds: ['library'], savedRoutes: [route] })
    expect(loadPersonalRecords('student-a')).toMatchObject({ ownerId: 'student-a', scope: 'account', favoriteLocationIds: [], savedRoutes: [] })
  })

  it('restores each owner separately across switching accounts and logout', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify(legacy)))
    expect(savePersonalRecords('student-a', { favoriteLocationIds: ['canteen'], savedRoutes: [route] })).toBe(true)
    expect(savePersonalRecords('student-b', { favoriteLocationIds: ['teaching-a'], savedRoutes: [] })).toBe(true)
    expect(loadPersonalRecords('student-b').favoriteLocationIds).toEqual(['teaching-a'])
    expect(loadPersonalRecords(null).favoriteLocationIds).toEqual(['library'])
    expect(loadPersonalRecords('student-a')).toMatchObject({ favoriteLocationIds: ['canteen'], savedRoutes: [route] })
  })

  it('does not resurrect legacy guest entries after the guest removes them', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify(legacy)))
    savePersonalRecords(null, { favoriteLocationIds: [], savedRoutes: [] })
    expect(loadPersonalRecords(null).favoriteLocationIds).toEqual([])
    expect(loadPersonalRecords(null).savedRoutes).toEqual([])
  })

  it('does not copy account collections into the legacy device snapshot during normal app saves', () => {
    const storage = storageWith(JSON.stringify(legacy))
    vi.stubGlobal('localStorage', storage)
    savePersistedState({ ...legacy, personalRecordsOwner: 'student-a', favoriteLocationIds: ['canteen'], savedRoutes: [] })
    expect(loadPersistedState()).toMatchObject({ favoriteLocationIds: ['library'], savedRoutes: [route] })
  })

  it('preserves ownerless records during the initial auth-loading render before any owner is hydrated', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify(legacy)))
    savePersistedState({ ...legacy, personalRecordsOwner: undefined, favoriteLocationIds: [], savedRoutes: [] })
    expect(loadPersistedState()).toMatchObject({ favoriteLocationIds: ['library'], savedRoutes: [route] })
  })

  it('keeps guest records intact when saving an account collection fails', () => {
    const storage = storageWith(JSON.stringify(legacy))
    vi.stubGlobal('localStorage', storage)
    savePersonalRecords(null, { favoriteLocationIds: ['teaching-a'], savedRoutes: [] })
    const write = storage.setItem
    storage.setItem = (key, value) => { if (key.includes('.account.')) throw new Error('quota'); write(key, value) }
    expect(savePersonalRecords('student-a', { favoriteLocationIds: ['canteen'], savedRoutes: [route] })).toBe(false)
    expect(loadPersonalRecords(null)).toMatchObject({ favoriteLocationIds: ['teaching-a'], savedRoutes: [] })
    expect(loadPersistedState()).toMatchObject({ favoriteLocationIds: ['library'], savedRoutes: [route] })
  })

  it('reports unavailable storage instead of pretending the collection was saved', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    expect(savePersonalRecords('student-a', { favoriteLocationIds: ['library'], savedRoutes: [] })).toBe(false)
  })

  it('rejects malformed local records and a mismatched owner without exposing data', () => {
    const storage = storageWith(null)
    vi.stubGlobal('localStorage', storage)
    expect(savePersonalRecords('student-a', { favoriteLocationIds: [null], savedRoutes: [] })).toBe(false)
    savePersonalRecords('student-a', { favoriteLocationIds: ['library'], savedRoutes: [] })
    const accountKey = [...storage.values.keys()].find(key => key !== SETTINGS_STORAGE_KEY)
    storage.setItem(accountKey, JSON.stringify({ schemaVersion: 1, ownerId: 'student-b', favoriteLocationIds: ['canteen'], savedRoutes: [] }))
    expect(loadPersonalRecords('student-a')).toMatchObject({ favoriteLocationIds: [], savedRoutes: [] })
  })
})
