import { describe, it, expect } from 'vitest'
import { campusReducer, createInitialState } from './campusReducer.js'
import { locationRepository } from '../data/locations.js'

describe('collection owner transitions', () => {
  it('replaces all private collections and clears a previous owner route on account change', () => {
    const initial = createInitialState(locationRepository.loadAll())
    const first = campusReducer({ ...initial, routePlan: { originId: 'library', destinationId: 'canteen' } }, { type: 'SET_PERSONAL_RECORDS', ownerId: 'student-a', records: { favoriteLocationIds: ['library'], savedRoutes: [] } })
    expect(first).toMatchObject({ personalRecordsOwner: 'student-a', favoriteLocationIds: ['library'], savedRoutes: [], routePlan: null })
    const second = campusReducer(first, { type: 'SET_PERSONAL_RECORDS', ownerId: 'student-b', records: { favoriteLocationIds: ['canteen'], savedRoutes: [] } })
    expect(second.favoriteLocationIds).toEqual(['canteen'])
    expect(second.personalRecordsOwner).toBe('student-b')
    const guest = campusReducer(second, { type: 'SET_PERSONAL_RECORDS', ownerId: null, records: { favoriteLocationIds: [], savedRoutes: [] } })
    expect(guest.favoriteLocationIds).toEqual([])
    expect(guest.personalRecordsOwner).toBeNull()
  })

  it('ignores unknown place ids and malformed routes while hydrating account collections', () => {
    const initial = createInitialState(locationRepository.loadAll())
    const next = campusReducer(initial, { type: 'SET_PERSONAL_RECORDS', ownerId: 'student-a', records: { favoriteLocationIds: ['library', 'missing', 'library'], savedRoutes: [null, { id: 'bad', originId: 'library', destinationId: 'canteen', mode: 'teleport' }] } })
    expect(next.favoriteLocationIds).toEqual(['library'])
    expect(next.savedRoutes).toEqual([])
  })

  it('preserves an active route when reloading collections for the same owner', () => {
    const routePlan = { originId: 'library', destinationId: 'canteen' }
    const initial = { ...createInitialState(locationRepository.loadAll()), personalRecordsOwner: 'student-a', routePlan }
    const next = campusReducer(initial, { type: 'SET_PERSONAL_RECORDS', ownerId: 'student-a', records: { favoriteLocationIds: ['library'], savedRoutes: [] } })
    expect(next.routePlan).toBe(routePlan)
  })
})
