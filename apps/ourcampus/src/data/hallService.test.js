import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profiles: [], columns: '', profileError: null }))
vi.mock('./supabaseClient.js', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: 'https://campus.test/storage/v1/object/public/avatars/' + path } }) }) } },
  requireSupabase: () => ({
    from: (table) => {
      if (table !== 'profiles') throw new Error(`Unexpected table ${table}`)
      return { select: (columns) => {
        mocks.columns = columns
        return { in: async () => ({ data: mocks.profiles, error: mocks.profileError }) }
      } }
    },
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://campus.test/storage/v1/object/public/avatars/${path}` } }) }) },
  }),
}))
import * as hall from './hallService.js'

const authorId = '11111111-1111-4111-8111-111111111111'
const avatarPath = `${authorId}/new-avatar.webp`
const oldProfile = { user_id: authorId, nickname: '旧昵称', avatar_path: `${authorId}/old.webp`, updated_at: '2026-10-21T02:00:00.123400+00:00' }
const newProfile = { user_id: authorId, nickname: '新昵称', avatar_path: avatarPath, updated_at: '2026-10-21T02:00:00.123401+00:00' }
const row = { id: '22222222-2222-4222-8222-222222222222', author_id: authorId, region_id: 'library', content: '历史发言', created_at: '2026-10-20T12:00:00.123456+00:00', client_message_id: '33333333-3333-4333-8333-333333333333', deleted_at: null }

beforeEach(() => { mocks.profiles = []; mocks.columns = ''; mocks.profileError = null })

describe('hall author profiles', () => {
  it('hydrates the safe avatar and exact profile version while keeping string nickname callers', async () => {
    mocks.profiles = [{ ...newProfile, email: 'private@campus.test', bio: 'private' }]
    const [message] = await hall.hydrateHallMessages([row])
    expect(mocks.columns).toBe('user_id,nickname,avatar_path,updated_at')
    expect(message).toMatchObject({ author: '新昵称', authorAvatarPath: avatarPath, authorAvatarUrl: `https://campus.test/storage/v1/object/public/avatars/${avatarPath}`, authorProfileUpdatedAt: newProfile.updated_at })
    expect(message).not.toHaveProperty('email')
    expect(hall.toHallMessage(row, '兼容昵称').author).toBe('兼容昵称')
  })

  it('accepts a profile object and clears an absent avatar', () => {
    expect(hall.toHallMessage(row, { ...newProfile, avatar_path: null })).toMatchObject({ author: '新昵称', authorAvatarPath: null, authorAvatarUrl: '', authorProfileUpdatedAt: newProfile.updated_at })
  })

  it('keeps newer microsecond profiles on every loaded history item when an old page arrives', () => {
    expect(hall.createHallProfileCache).toBeTypeOf('function')
    const cache = hall.createHallProfileCache()
    const oldRequest = cache.beginRequest()
    cache.updateProfiles([newProfile])
    const history = [hall.toHallMessage(row, oldProfile), hall.toHallMessage({ ...row, id: 'older', created_at: '2026-10-01T00:00:00Z' }, oldProfile)]
    cache.absorbMessages(history, oldRequest)
    expect(cache.apply(history).map((message) => [message.author, message.authorAvatarPath])).toEqual([['新昵称', avatarPath], ['新昵称', avatarPath]])
  })

  it('applies avatar clearing to old messages and ignores a late snapshot after profile deletion', () => {
    expect(hall.createHallProfileCache).toBeTypeOf('function')
    const cache = hall.createHallProfileCache()
    cache.updateProfiles([oldProfile])
    const beforeDelete = cache.beginRequest()
    cache.deleteProfile(authorId)
    cache.updateProfiles([newProfile], beforeDelete)
    const [fallback] = cache.apply([hall.toHallMessage(row, oldProfile)])
    expect(fallback).toMatchObject({ author: '校园同学', authorAvatarPath: null, authorAvatarUrl: '' })
    cache.updateProfiles([{ ...newProfile, avatar_path: null }], cache.beginRequest())
    expect(cache.apply([fallback])[0]).toMatchObject({ author: '新昵称', authorAvatarPath: null, authorAvatarUrl: '' })
  })

  it('does not let an earlier query erase a profile observed after that query started', () => {
    expect(hall.createHallProfileCache).toBeTypeOf('function')
    const cache = hall.createHallProfileCache()
    const request = cache.beginRequest()
    cache.updateProfiles([newProfile])
    cache.updateProfiles([], request, [authorId])
    expect(cache.apply([hall.toHallMessage(row)])[0].author).toBe('新昵称')
  })

  it('preserves message removal tombstones while applying profile changes', () => {
    expect(hall.createHallProfileCache).toBeTypeOf('function')
    const cache = hall.createHallProfileCache()
    cache.updateProfiles([newProfile])
    const messages = hall.mergeHallMessages([hall.toHallMessage(row, oldProfile)], [hall.toHallMessage(row, oldProfile)], new Set([row.id]))
    expect(cache.apply(messages)).toEqual([])
  })
})


describe('profile version ordering', () => {
  it('compares microseconds across equivalent timezone offsets without millisecond truncation', () => {
    const cache = hall.createHallProfileCache()
    const request = cache.beginRequest()
    cache.updateProfiles([{ ...newProfile, updated_at: '2026-10-21T10:00:00.123401+08:00' }])
    cache.updateProfiles([{ ...oldProfile, updated_at: '2026-10-21T02:00:00.123400Z' }], request)
    expect(cache.apply([hall.toHallMessage(row)])[0].author).toBe('新昵称')
    cache.updateProfiles([{ ...oldProfile, updated_at: '2026-10-21T02:00:00.123401Z' }], request)
    expect(cache.apply([hall.toHallMessage(row)])[0].author).toBe('新昵称')
  })

  it('lets a truly newer timestamp win even when its request started first', () => {
    const cache = hall.createHallProfileCache()
    const request = cache.beginRequest()
    cache.updateProfiles([oldProfile])
    cache.updateProfiles([newProfile], request)
    expect(cache.apply([hall.toHallMessage(row)])[0].author).toBe('新昵称')
  })

  it('applies clearing an avatar to every message and never spreads other profile columns', () => {
    const cache = hall.createHallProfileCache()
    cache.updateProfiles([oldProfile])
    const messages = [hall.toHallMessage(row, oldProfile), hall.toHallMessage({ ...row, id: 'older' }, oldProfile)]
    cache.updateProfiles([{ ...newProfile, avatar_path: null, email: 'private', bio: 'private' }])
    for (const entry of cache.apply(messages)) {
      expect(entry).toMatchObject({ author: '新昵称', authorAvatarPath: null, authorAvatarUrl: '' })
      expect(entry).not.toHaveProperty('email')
      expect(entry).not.toHaveProperty('bio')
    }
  })
})

it('retains private image references when author profiles are hydrated', async () => {
  const imagePath = `${authorId}/44444444-4444-4444-8444-444444444444.jpg`
  expect((await hall.hydrateHallMessages([{ ...row, content: '', image_paths: [imagePath] }]))[0]).toMatchObject({ content: '', imagePaths: [imagePath] })
})
