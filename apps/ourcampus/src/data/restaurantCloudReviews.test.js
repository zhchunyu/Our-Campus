import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabaseClient.js', () => ({ requireSupabase: () => ({ rpc: mocks.rpc }) }))
import { mapCloudReview, submitWindowCloudReview } from './restaurantCloudReviews.js'

const owner = '11111111-1111-4111-8111-111111111111'
const path = `${owner}/22222222-2222-4222-8222-222222222222.jpg`
const draft = { clientId: 'client-id', restaurantId: 'canteen', windowId: 'window-id', rating: 4, content: '味道很好', tags: [], price: null, authorId: owner }
beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: 'review-id', error: null }))
describe('restaurant cloud attachments', () => {
  it('retains the deployed text-only RPC contract for old servers', async () => {
    await submitWindowCloudReview(draft)
    expect(mocks.rpc.mock.calls[0][0]).toBe('campus_submit_restaurant_review')
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_image_paths')
  })
  it('sends canonical private paths to the new atomic photo RPC', async () => {
    await submitWindowCloudReview({ ...draft, imagePaths: [path] })
    expect(mocks.rpc).toHaveBeenCalledWith('campus_submit_restaurant_review_with_images', expect.objectContaining({ p_image_paths: [path], p_client_id: draft.clientId }))
  })
  it('never silently publishes text without the selected photos when the photo RPC is absent', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } })
    await expect(submitWindowCloudReview({ ...draft, imagePaths: [path] })).rejects.toThrow('照片服务')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects another account or external photo before contacting the server', async () => {
    await expect(submitWindowCloudReview({ ...draft, authorId: '33333333-3333-4333-8333-333333333333', imagePaths: [path] })).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('restores canonical attachment references, without accepting arbitrary URLs', () => {
    const row = { price: null, image_paths: [path] }
    expect(mapCloudReview(row).imagePaths).toEqual([path])
    expect(mapCloudReview({ ...row, image_paths: ['https://external.test/a.jpg'] }).imagePaths).toEqual([])
    expect(mapCloudReview({ price: null }).imagePaths).toEqual([])
  })
})
