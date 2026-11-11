import { describe, expect, it, vi } from 'vitest'
import { createLocalCampusDataSource } from './campusDataSource.js'

const seedLocations = [{ id: 'library', name: '图书馆', openStatus: 'open' }]
const seedEvents = [{ id: 'event-1', title: '讲座', status: 'active' }]

describe('local campus data source', () => {
  it('returns a cloned initial snapshot', () => {
    const source = createLocalCampusDataSource({ locations: seedLocations, events: seedEvents })
    const snapshot = source.loadSnapshot()

    snapshot.locations[0].name = '被修改的副本'
    snapshot.events.push({ id: 'event-2' })

    expect(source.loadSnapshot().locations[0].name).toBe('图书馆')
    expect(source.loadSnapshot().events).toHaveLength(1)
  })

  it('publishes events and notifies subscribers once', () => {
    const source = createLocalCampusDataSource({ locations: seedLocations, events: seedEvents })
    const listener = vi.fn()
    source.subscribe(listener)

    const snapshot = source.publishEvent({ id: 'event-2', title: '社团招新', status: 'active' })

    expect(snapshot.events).toHaveLength(2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(snapshot)
  })

  it('updates only the requested location', () => {
    const source = createLocalCampusDataSource({
      locations: [...seedLocations, { id: 'canteen', name: '食堂', openStatus: 'open' }],
      events: seedEvents,
    })

    const snapshot = source.updateLocation('library', { openStatus: 'closed' })

    expect(snapshot.locations[0]).toMatchObject({ id: 'library', name: '图书馆', openStatus: 'closed' })
    expect(snapshot.locations[1]).toMatchObject({ id: 'canteen', name: '食堂', openStatus: 'open' })
    expect(snapshot.locations[1]).not.toHaveProperty('updatedAt', '刚刚更新')
  })

  it('closes an event and supports unsubscribe', () => {
    const source = createLocalCampusDataSource({ locations: seedLocations, events: seedEvents })
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)

    expect(source.closeEvent('event-1').events[0].status).toBe('closed')
    unsubscribe()
    source.closeEvent('event-1')

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
