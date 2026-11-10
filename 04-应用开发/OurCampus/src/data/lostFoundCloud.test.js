import { describe, expect, it } from 'vitest'
import * as community from './campusCommunity.js'

const owner = '11111111-1111-4111-8111-111111111111'
const path = `${owner}/22222222-2222-4222-8222-222222222222.jpg`
const locations = [{ id: 'library', name: '图书馆', category: 'learning' }]
const row = { id: 'report-1', author_id: owner, kind: 'found', title: '白色耳机', body: '白色外壳',
  location_id: 'library', status: 'submitted', created_at: '2026-10-25T04:00:00Z', updated_at: '2026-10-25T05:00:00Z',
  details: { item_name: '耳机', contact: '图书馆前台', location_detail: '一楼', image_paths: [path] } }

describe('cloud lost/found image compatibility', () => {
  it('maps real cloud image paths for another device without a local data URL', () => {
    expect(community.cloudLostFoundPost(row, locations)).toMatchObject({
      id: 'report-1', cloudReportId: 'report-1', authorId: owner, type: 'found', title: '耳机',
      regionId: 'teaching', status: 'active', image: '', imagePaths: [path],
    })
  })
  it('preserves old device photos only for cloud rows without a cloud image reference', () => {
    const local = [{ cloudReportId: row.id, image: 'data:image/jpeg;base64,YWJj' }]
    expect(community.cloudLostFoundPost({ ...row, status: 'resolved', details: {} }, locations, local))
      .toMatchObject({ image: local[0].image, imagePaths: [], status: 'resolved' })
    expect(community.cloudLostFoundPost(row, locations, local)).toMatchObject({ image: '', imagePaths: [path] })
  })
  it('excludes withdrawn/rejected reports and rejects invalid attachment references', () => {
    expect(community.cloudLostFoundPost({ ...row, status: 'withdrawn' }, locations)).toBeNull()
    expect(community.cloudLostFoundPost({ ...row, status: 'rejected' }, locations)).toBeNull()
    expect(community.cloudLostFoundPost({ ...row, kind: 'notice' }, locations)).toBeNull()
    expect(community.cloudLostFoundPost({ ...row, details: { image_paths: ['https://example.org/public.jpg'] } }, locations))
      .toMatchObject({ imagePaths: [] })
  })
  it('does not persist cloud object references as the legacy local photo field', () => {
    const post = community.createLostFoundPost({ type: 'found', title: '耳机', description: '白色外壳',
      contact: '图书馆前台', locationId: 'library', locationDetail: '', occurredAt: row.created_at,
      image: '', imagePaths: [path] }, locations, null, new Date('2026-10-26T04:00:00Z'))
    expect(post.image).toBe('')
    expect(post).not.toHaveProperty('imagePaths')
    expect(community.isSavedLostFoundPost(post)).toBe(true)
  })
  it('builds report details from allowed text and private references without copying local photos', () => {
    const post = { title: '耳机', contact: '前台', locationDetail: '一楼', occurredAt: row.created_at,
      image: 'data:image/jpeg;base64,YWJj' }
    expect(community.lostFoundReportDetails(post, [path], owner)).toEqual({
      item_name: '耳机', contact: '前台', location_detail: '一楼', occurred_at: row.created_at, image_paths: [path],
    })
    expect(() => community.lostFoundReportDetails(post, [path], '33333333-3333-4333-8333-333333333333')).toThrow(/照片引用无效/)
    expect(() => community.lostFoundReportDetails(post, ['https://example.org/photo.jpg'], owner)).toThrow(/照片引用无效/)
    expect(community.lostFoundReportDetails(post, [], owner)).toEqual({
      item_name: '耳机', contact: '前台', location_detail: '一楼', occurred_at: row.created_at,
    })
  })
})
