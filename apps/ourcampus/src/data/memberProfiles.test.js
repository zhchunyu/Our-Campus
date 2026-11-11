import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const calls = { selects: [], updates: [], batches: [], uploads: [], removes: [] }
  const state = { row: null, error: null, uploadError: null, onUpload: null, onUpdate: null }
  const query = {
    select: vi.fn((columns) => { calls.selects.push(columns); return query }),
    eq: vi.fn(() => query),
    in: vi.fn(async (_column, ids) => { calls.batches.push(ids); return { data: ids.map((id) => ({ user_id: id, nickname: id, avatar_path: null, updated_at: null, email: 'private' })), error: state.error } }),
    update: vi.fn((value) => { calls.updates.push(value); return query }),
    maybeSingle: vi.fn(async () => { if (state.onUpdate) await state.onUpdate(); return { data: state.row, error: state.error } }),
    single: vi.fn(async () => { if (state.onUpdate) await state.onUpdate(); return { data: state.row && (state.returnUnchanged ? state.row : { ...state.row, ...calls.updates.at(-1) }), error: state.error } }),
  }
  const storage = {
    getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/avatars/${path}` } })),
    upload: vi.fn(async (...args) => { calls.uploads.push(args); if (state.onUpload) await state.onUpload(); return { data: { path: args[0] }, error: state.uploadError } }),
    remove: vi.fn((...args) => { calls.removes.push(args); return Promise.resolve({ error: null }) }),
  }
  const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => storage) } }
  return { calls, state, query, storage, client }
})
vi.mock('./supabaseClient.js', () => ({ supabase: mocks.client, requireSupabase: () => mocks.client }))

const profiles = await import('./memberProfiles.js')
const userId = 'a8c41f0f-d998-41f5-9fa8-73275de266ac'
const row = { user_id: userId, nickname: '同学', avatar_path: null, updated_at: '2026-10-21T08:00:00Z' }
const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

beforeEach(() => {
  for (const entries of Object.values(mocks.calls)) entries.length = 0
  Object.assign(mocks.state, { row: { ...row }, error: null, uploadError: null, onUpload: null, onUpdate: null, returnUnchanged: false })
  vi.clearAllMocks()
})

describe('shared member profiles', () => {
  it('exports only the basic profile columns needed for campus identity', () => {
    expect(profiles.PROFILE_COLUMNS).toBe('user_id,nickname,avatar_path,updated_at')
  })

  it('builds avatar URLs only from safe paths in the configured avatars bucket', () => {
    const path = `${userId}/unique.jpg`
    expect(profiles.getAvatarUrl(path)).toBe(`https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/avatars/${path}`)
    for (const unsafe of ['', null, 'https://evil.test/a.jpg', 'data:image/png;base64,YWJj', '../avatars/a.jpg', `${userId}/../secret.jpg`, `${userId}/a.jpg?x=1`, `${userId}/a%2f.jpg`, `${userId}/a.svg`]) {
      expect(profiles.getAvatarUrl(unsafe)).toBe('')
    }
  })

  it('deduplicates and batches member lookups by 100 without exposing extra fields', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
    const rows = await profiles.listMemberProfiles([...ids, ids[0], null, ''])
    expect(mocks.calls.batches.map((batch) => batch.length)).toEqual([100, 100, 5])
    expect(rows).toHaveLength(205)
    expect(rows[0]).toEqual({ user_id: ids[0], nickname: ids[0], avatar_path: null, updated_at: null })
    expect(mocks.calls.selects).toEqual(Array(3).fill(profiles.PROFILE_COLUMNS))
  })

  it('returns a missing member as null and requests only basic profile fields', async () => {
    mocks.state.row = null
    expect(await profiles.getMemberProfile(userId)).toBeNull()
    expect(mocks.query.maybeSingle).toHaveBeenCalledOnce()
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', userId)
    expect(mocks.calls.selects).toEqual([profiles.PROFILE_COLUMNS])
  })

  it('removes unexpected server fields from a basic member response', async () => {
    mocks.state.row = { ...row, email: 'private', role: 'manager' }
    expect(await profiles.getMemberProfile(userId)).toEqual(row)
  })

  it('uploads a unique object without upsert and updates only the owner avatar path', async () => {
    const result = await profiles.saveProfileAvatar({ userId, image })
    const [path, blob, options] = mocks.calls.uploads[0]
    expect(path).toMatch(new RegExp(`^${userId}/[a-f0-9-]{36}\\.jpg$`))
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/jpeg')
    expect(options).toMatchObject({ upsert: false, contentType: 'image/jpeg' })
    expect(mocks.calls.updates).toEqual([{ avatar_path: path }])
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', userId)
    expect(mocks.calls.selects).toEqual([profiles.PROFILE_COLUMNS])
    expect(result).toEqual({ ...row, avatar_path: path })
    expect(mocks.calls.removes).toEqual([])
  })

  it('clears the shared avatar without uploading or deleting old objects', async () => {
    await profiles.saveProfileAvatar({ userId, image: '' })
    expect(mocks.calls.updates).toEqual([{ avatar_path: null }])
    expect(mocks.calls.uploads).toEqual([])
    expect(mocks.calls.removes).toEqual([])
  })

  it('rejects malformed, unsupported and oversized images before any write', async () => {
    const tooLarge = `data:image/png;base64,${'AAAA'.repeat(Math.ceil((5 * 1024 * 1024 + 1) / 3))}`
    for (const invalid of ['data:image/svg+xml;base64,YWJj', 'data:image/jpeg;base64,@@@', 'data:image/jpeg;base64,A', 'https://example.test/a.jpg', null, tooLarge]) {
      await expect(profiles.saveProfileAvatar({ userId, image: invalid })).rejects.toThrow()
    }
    expect(mocks.calls.uploads).toEqual([])
    expect(mocks.calls.updates).toEqual([])
  })

  it('does not write a profile when the upload fails', async () => {
    mocks.state.uploadError = new Error('upload refused')
    await expect(profiles.saveProfileAvatar({ userId, image })).rejects.toThrow('upload refused')
    expect(mocks.calls.updates).toEqual([])
  })

  it('preserves an uploaded object after an ambiguous update failure', async () => {
    mocks.state.error = new Error('response lost after commit')
    await expect(profiles.saveProfileAvatar({ userId, image })).rejects.toThrow('response lost')
    expect(mocks.calls.removes).toEqual([])
  })

  it('checks account ownership before upload and before updating the profile', async () => {
    let current = false
    await expect(profiles.saveProfileAvatar({ userId, image, isCurrent: () => current })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.calls.uploads).toEqual([])
    current = true
    mocks.state.onUpload = () => { current = false }
    await expect(profiles.saveProfileAvatar({ userId, image, isCurrent: () => current })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.calls.updates).toEqual([])
    expect(mocks.calls.removes).toEqual([])
  })

  it('does not return a successful save after the owner changes during the update', async () => {
    let current = true
    mocks.state.onUpdate = () => { current = false }
    await expect(profiles.saveProfileAvatar({ userId, image, isCurrent: () => current })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.calls.removes).toEqual([])
  })

  it('rejects an unchanged response instead of claiming the new avatar was synchronized', async () => {
    mocks.state.returnUnchanged = true
    await expect(profiles.saveProfileAvatar({ userId, image })).rejects.toThrow()
    expect(mocks.calls.removes).toEqual([])
  })

  it('does not send invalid UUIDs to the profile API', async () => {
    expect(await profiles.getMemberProfile('member-a')).toBeNull()
    expect(await profiles.listMemberProfiles(['member-a'])).toEqual([])
    await expect(profiles.saveProfileAvatar({ userId: 'member-a', image: '' })).rejects.toThrow()
    expect(mocks.client.from).not.toHaveBeenCalled()
    expect(profiles.getAvatarUrl('member-a/a.jpg')).toBe('')
  })

  it('returns no profiles without making a query when there are no usable owner IDs', async () => {
    expect(await profiles.listMemberProfiles([null, '', '../someone'])).toEqual([])
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('propagates member lookup failures without reporting an empty successful result', async () => {
    mocks.state.error = new Error('profiles unavailable')
    await expect(profiles.listMemberProfiles([userId])).rejects.toThrow('profiles unavailable')
    await expect(profiles.getMemberProfile(userId)).rejects.toThrow('profiles unavailable')
  })

  it('rejects a missing update row rather than claiming a synchronized avatar', async () => {
    mocks.state.row = null
    await expect(profiles.saveProfileAvatar({ userId, image: '' })).rejects.toThrow()
  })
})
