import { describe, expect, it, vi } from 'vitest'
import { createHttpCampusDataSource } from './httpCampusDataSource.js'

describe('HTTP campus data source', () => {
  it('maps local mutations to future API endpoints', async () => {
    const fetchImpl = vi.fn(async (url, options) => ({
      ok: true,
      json: async () => ({ url, method: options?.method ?? 'GET', body: options?.body ?? null }),
    }))
    const source = createHttpCampusDataSource({ baseUrl: '/api/v1', fetchImpl })

    await source.loadSnapshot()
    await source.updateLocation('library', { openStatus: 'closed' })
    await source.publishEvent({ id: 'event-1' })
    await source.closeEvent('event-1')

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/snapshot',
      '/api/v1/locations/library',
      '/api/v1/events',
      '/api/v1/events/event-1/close',
    ])
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'PATCH' })
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: 'POST' })
  })

  it('surfaces server failures to the caller', async () => {
    const source = createHttpCampusDataSource({
      fetchImpl: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    })

    await expect(source.loadSnapshot()).rejects.toThrow('503')
  })
})
