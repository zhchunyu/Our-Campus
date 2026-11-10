import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabaseClient.js', () => ({ requireSupabase: () => { throw new Error('Inject a test client') } }))
import { hallSubscriptionScope, isHallSubscription, hallNotificationRegion, setHallNotificationSubscription, getHallNotificationMessage, getCurrentHallNotificationDetail } from './hallNotifications.js'

const userId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
function mockClient(result = { data: null, error: null }) {
  const query = { insert: vi.fn(), delete: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() }
  for (const fn of ['insert', 'delete', 'select', 'eq', 'is']) query[fn].mockReturnValue(query)
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  query.maybeSingle.mockResolvedValue(result)
  return { from: vi.fn(() => query), query }
}
describe('explicit hall notification consent', () => {
  it('rejects all and unknown regions instead of creating an all-user scope', () => {
    expect(hallSubscriptionScope('living')).toBe('hall-region:living')
    expect(() => hallSubscriptionScope('all')).toThrow()
    expect(() => hallSubscriptionScope('missing')).toThrow()
  })
  it('never treats broad campus subscriptions as chat consent', () => {
    expect(isHallSubscription({ location_id: '', kind: '' })).toBe(false)
    expect(isHallSubscription({ location_id: 'hall-region:living', kind: '' })).toBe(false)
    expect(isHallSubscription({ location_id: 'hall-region:living', kind: 'hall-message' })).toBe(true)
    expect(isHallSubscription({ location_id: 'hall-region:missing', kind: 'hall-message' })).toBe(false)
  })
  it('saves only a precise region without accepting a recipient override', async () => {
    const client = mockClient()
    await setHallNotificationSubscription({ userId, regionId: 'sports', enabled: true }, client)
    expect(client.from).toHaveBeenCalledWith('campus_subscriptions')
    expect(client.query.insert).toHaveBeenCalledWith({ location_id: 'hall-region:sports', kind: 'hall-message' })
  })
  it('removes only this user and exact chat subscription, retaining campus subscriptions', async () => {
    const client = mockClient()
    await setHallNotificationSubscription({ userId, regionId: 'dorm', enabled: false }, client)
    expect(client.query.delete).toHaveBeenCalledOnce()
    expect(client.query.eq.mock.calls).toEqual([['user_id', userId], ['location_id', 'hall-region:dorm'], ['kind', 'hall-message']])
    expect(client.query.insert).not.toHaveBeenCalled()
  })
  it('accepts duplicate consent but surfaces a missing server upgrade', async () => {
    await expect(setHallNotificationSubscription({ userId, regionId: 'gate', enabled: true }, mockClient({ error: { code: '23505' } }))).resolves.toBeUndefined()
    await expect(setHallNotificationSubscription({ userId, regionId: 'gate', enabled: true }, mockClient({ error: { code: '23514' } }))).rejects.toThrow('升级')
  })
  it('rejects an absent login and invalid region before a database write', async () => {
    const client = mockClient()
    await expect(setHallNotificationSubscription({ userId: null, regionId: 'dorm', enabled: true }, client)).rejects.toThrow()
    await expect(setHallNotificationSubscription({ userId, regionId: 'all', enabled: true }, client)).rejects.toThrow()
    expect(client.from).not.toHaveBeenCalled()
  })
})
describe('chat notice destinations', () => {
  const notice = { type: 'hall-message', related_type: 'message', related_id: messageId }
  const message = { id: messageId, region_id: 'teaching', content: 'A fixture message', deleted_at: null }
  it('opens only the live source message region', () => {
    expect(hallNotificationRegion(notice, message)).toBe('teaching')
    expect(hallNotificationRegion(notice, { ...message, deleted_at: '2026-11-01' })).toBeNull()
    expect(hallNotificationRegion(notice, { ...message, id: userId })).toBeNull()
    expect(hallNotificationRegion({ ...notice, related_type: 'event' }, message)).toBeNull()
  })
  it('looks up only the indicated non-retracted message and never exposes a deleted source', async () => {
    const client = mockClient({ data: message, error: null })
    expect(await getHallNotificationMessage(notice, client)).toEqual(message)
    expect(client.query.eq).toHaveBeenCalledWith('id', messageId)
    expect(client.query.is).toHaveBeenCalledWith('deleted_at', null)
    expect(await getHallNotificationMessage(notice, mockClient({ data: { ...message, deleted_at: '2026-11-01' }, error: null }))).toBeNull()
  })
  it('does not query a malformed or unrelated destination', async () => {
    const client = mockClient()
    expect(await getHallNotificationMessage({ ...notice, related_id: 'not-a-uuid' }, client)).toBeNull()
    expect(await getHallNotificationMessage({ ...notice, related_type: 'event' }, client)).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })
})

describe('open chat notice refresh', () => {
  const notice = { id: '33333333-3333-4333-8333-333333333333', recipient_id: userId, type: 'hall-message', related_type: 'message', related_id: messageId }
  const message = { id: messageId, region_id: 'teaching', content: 'Live message', deleted_at: null }
  it('rechecks an older notice by ID rather than relying on the recent notification page', async () => {
    const client = mockClient()
    client.query.maybeSingle.mockResolvedValueOnce({ data: notice }).mockResolvedValueOnce({ data: message })
    expect(await getCurrentHallNotificationDetail(notice, userId, client)).toEqual({ notice, target: message })
    expect(client.from.mock.calls).toEqual([['notifications'], ['hall_messages']])
    expect(client.query.eq).toHaveBeenCalledWith('recipient_id', userId)
  })
  it('clears an opened detail when the notice is removed by unsubscribe or retraction', async () => {
    const client = mockClient({ data: null })
    expect(await getCurrentHallNotificationDetail(notice, userId, client)).toBeNull()
    expect(client.from.mock.calls).toEqual([['notifications']])
  })
  it.each([null, { ...message, deleted_at: '2026-11-10' }])('does not reuse cached text when the live source is unavailable', async (source) => {
    const client = mockClient()
    client.query.maybeSingle.mockResolvedValueOnce({ data: notice }).mockResolvedValueOnce({ data: source })
    expect(await getCurrentHallNotificationDetail(notice, userId, client)).toBeNull()
  })
  it('does not query another account and surfaces a failed revalidation', async () => {
    const client = mockClient({ error: new Error('offline') })
    expect(await getCurrentHallNotificationDetail(notice, messageId, client)).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
    await expect(getCurrentHallNotificationDetail(notice, userId, client)).rejects.toThrow('offline')
  })
})
