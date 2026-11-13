import { describe, expect, it } from 'vitest'
import { COMMUNITY_STORAGE_KEY, LOCAL_AUTHOR_ID, MAX_LOCAL_POSTS, createDemoLostFoundPosts, createFacilityContribution, createLostFoundPost, filterLostFoundPosts, getCampusRegionId, isLocalPhoto, loadCommunityState, reviewFacilityContribution, saveCommunityState, updateLostFoundStatus } from './campusCommunity.js'

const locations = [{ id: 'library', name: '图书馆', category: 'learning' }, { id: 'canteen', name: '谷园餐厅', category: 'dining' }]
const now = new Date('2026-10-03T04:00:00Z')
const input = { type: 'lost', title: ' 蓝伞 ', description: ' 灰色挂绳 ', contact: ' 领取点：图书馆 ', locationId: 'library', locationDetail: '一楼', occurredAt: '2026-10-03T03:00:00Z', image: '' }
const create = (overrides = {}) => createLostFoundPost({ ...input, ...overrides }, locations, null, now)
const storageWith = (raw = null) => { const values = new Map([[COMMUNITY_STORAGE_KEY, raw]]); return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } }

describe('local campus community', () => {
  it('validates and normalizes a campus post, preserving identity on edit', () => {
    const post = create()
    expect(post).toMatchObject({ title: '蓝伞', contact: '领取点：图书馆', regionId: 'teaching', status: 'active', authorId: LOCAL_AUTHOR_ID })
    const edited = createLostFoundPost({ ...input, title: '黑伞', locationId: 'canteen' }, locations, post, new Date('2026-10-04T04:00:00Z'))
    expect(edited).toMatchObject({ id: post.id, createdAt: post.createdAt, title: '黑伞', regionId: 'living' })
  })
  it.each([{ title: ' ' }, { title: '伞'.repeat(41) }, { description: ' ' }, { contact: '' }, { locationId: 'unknown' }, { type: 'other' }, { occurredAt: 'invalid' }, { occurredAt: '2026-10-04T04:00:00Z' }, { image: 'https://example.org/photo.png' }])('rejects invalid input %o', (change) => {
    expect(() => create(change)).toThrow()
  })
  it('does not allow another author to edit or complete a post', () => {
    const foreign = { ...create(), authorId: 'other-user' }
    expect(() => createLostFoundPost(input, locations, foreign, now)).toThrow(/只能编辑/)
    expect(() => updateLostFoundStatus([foreign], foreign.id, 'resolved')).toThrow(/只能更新/)
  })
  it('completes and reopens a post without mutating the input', () => {
    const post = create()
    const updated = updateLostFoundStatus([post], post.id, 'resolved')
    expect(post.status).toBe('active')
    expect(updated[0].status).toBe('resolved')
    expect(updateLostFoundStatus(updated, post.id, 'active')[0].status).toBe('active')
    expect(() => updateLostFoundStatus(updated, post.id, 'bad')).toThrow()
  })
  it('combines region, type, keyword and status filters and excludes examples from mine', () => {
    const own = create({ description: '测试专属挂绳' })
    const done = { ...create({ type: 'found', title: '钥匙', locationId: 'canteen' }), status: 'resolved', id: 'done' }
    const posts = [own, done, ...createDemoLostFoundPosts()]
    expect(filterLostFoundPosts(posts, { regionId: 'teaching', query: '测试专属', type: 'lost' })).toEqual([own])
    expect(filterLostFoundPosts(posts, { type: 'mine', status: 'all' })).toHaveLength(2)
    expect(filterLostFoundPosts(posts, { type: 'found', status: 'resolved' })).toEqual([done])
    expect(posts).toHaveLength(4)
  })
  it('recognizes campus regions', () => {
    expect(getCampusRegionId({ category: 'living', name: '9号公寓楼' })).toBe('dorm')
    expect(getCampusRegionId({ category: 'service', name: '体育场' })).toBe('sports')
    expect(getCampusRegionId({ category: 'transport', name: '西校门' })).toBe('gate')
    expect(getCampusRegionId(null)).toBeNull()
  })
  it('accepts only small supported local photos', () => {
    expect(isLocalPhoto('data:image/jpeg;base64,YWJj')).toBe(true)
    expect(isLocalPhoto('data:image/svg+xml;base64,YWJj')).toBe(false)
    expect(isLocalPhoto('data:image/jpeg;base64,' + 'a'.repeat(180000))).toBe(false)
  })
  it('round trips validated records and ignores malformed saved items', () => {
    const storage = storageWith()
    const state = { posts: [create()], facilities: [] }
    saveCommunityState(state, storage)
    expect(loadCommunityState(storage)).toEqual(state)
    storage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, posts: [state.posts[0], null, { ...state.posts[0], contact: ' ' }], facilities: [] }))
    expect(loadCommunityState(storage).posts).toHaveLength(1)
    expect(loadCommunityState(storageWith('{bad-json'))).toEqual({ posts: [], facilities: [] })
    expect(loadCommunityState(storageWith('{"schemaVersion":2}'))).toEqual({ posts: [], facilities: [] })
  })
  it('reports unavailable or full storage without changing the supplied state', () => {
    const state = { posts: [create()], facilities: [] }
    expect(() => saveCommunityState(state, null)).toThrow(/无法保存/)
    expect(() => saveCommunityState(state, { setItem: () => { throw new Error('quota') } })).toThrow(/草稿已保留/)
    expect(state.posts).toHaveLength(1)
    expect(() => saveCommunityState({ ...state, posts: Array(MAX_LOCAL_POSTS + 1).fill(state.posts[0]) }, storageWith())).toThrow(/最多保存/)
  })
  it('keeps contributed facilities pending until a local manager confirms them', () => {
    const facility = createFacilityContribution({ type: 'water', name: '饮水点', detail: '二楼东侧（测试）', locationId: 'library' }, locations, now)
    expect(facility.status).toBe('pending')
    expect(() => reviewFacilityContribution([facility], facility.id, 'verified', 'student')).toThrow(/管理者/)
    const reviewed = reviewFacilityContribution([facility], facility.id, 'verified', 'manager')
    expect(reviewed[0].status).toBe('verified')
    expect(facility.status).toBe('pending')
    expect(() => reviewFacilityContribution(reviewed, facility.id, 'rejected', 'manager')).toThrow(/已处理/)
    expect(() => createFacilityContribution({ type: 'water', name: '饮水点', detail: '二楼', locationId: 'unknown' }, locations)).toThrow(/所属校园地点/)
  })
})
