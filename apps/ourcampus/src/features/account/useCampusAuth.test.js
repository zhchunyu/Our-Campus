import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [], dirty: false, result: null }))
vi.mock('react', () => ({
  useState(initial) {
    const index = hooks.cursor++
    if (!hooks.slots[index]) hooks.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
    return [hooks.slots[index].value, (value) => {
      const next = typeof value === 'function' ? value(hooks.slots[index].value) : value
      if (!Object.is(next, hooks.slots[index].value)) { hooks.slots[index].value = next; hooks.dirty = true }
    }]
  },
  useRef(initial) {
    const index = hooks.cursor++
    if (!hooks.slots[index]) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useCallback(callback, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) {
      hooks.slots[index] = { callback, dependencies }
    }
    return hooks.slots[index].callback
  },
  useEffect(effect, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) {
      hooks.pending.push(() => { previous?.cleanup?.(); hooks.slots[index] = { dependencies, cleanup: effect() } })
    }
  },
}))
const mocks = vi.hoisted(() => {
  const state = { authCallback: null, reads: [], avatarResponse: null, lastAvatarArgs: null, selected: [], channels: [] }
  const row = (id, avatar = null, updated = '2026-10-21T08:00:00Z') => ({ user_id: id, nickname: id, avatar_path: avatar, updated_at: updated })
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback) => { state.authCallback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } }),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'member-a' } } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => {
      let owner
      let patch = null
      const query = {
        select: vi.fn((columns) => { state.selected.push(columns); return query }),
        eq: vi.fn((_key, value) => { owner = value; return query }),
        update: vi.fn((value) => { patch = value; return query }),
        single: vi.fn(() => state.reads.length ? state.reads.shift() : Promise.resolve({ data: { ...row(owner), ...patch }, error: null })),
      }
      return query
    }),
    rpc: vi.fn(async () => ({ data: 'student', error: null })),
    channel: vi.fn((name) => {
      const channel = {
        name, filter: null, change: null, status: null,
        on: vi.fn((_event, filter, callback) => { channel.filter = filter; channel.change = callback; return channel }),
        subscribe: vi.fn((callback) => { channel.status = callback; return channel }),
      }
      state.channels.push(channel)
      return channel
    }),
    removeChannel: vi.fn(async () => 'ok'),
  }
  const saveProfileAvatar = vi.fn(async (args) => {
    state.lastAvatarArgs = args
    return state.avatarResponse ?? row(args.userId, `${args.userId}/saved.jpg`, '2026-10-21T09:00:00Z')
  })
  return { state, row, client, saveProfileAvatar }
})
vi.mock('../../data/supabaseClient.js', () => ({ supabase: mocks.client, requireSupabase: () => mocks.client, describeServerError: (error, fallback) => error?.message ?? fallback }))
vi.mock('../../data/memberProfiles.js', () => ({ PROFILE_COLUMNS: 'user_id,nickname,avatar_path,updated_at', saveProfileAvatar: mocks.saveProfileAvatar }))
vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { hash: '' } }))
vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
const { useCampusAuth } = await import('./useCampusAuth.js')

function render() {
  hooks.cursor = 0
  hooks.dirty = false
  hooks.result = useCampusAuth()
  const effects = hooks.pending.splice(0)
  effects.forEach((effect) => effect())
  return hooks.result
}
async function flush() {
  for (let turn = 0; turn < 12; turn++) { await Promise.resolve(); if (hooks.dirty) render() }
  return hooks.result
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function switchAccount(id) { mocks.state.authCallback('SIGNED_IN', id ? { user: { id } } : null) }

beforeEach(async () => {
  for (const slot of hooks.slots) slot?.cleanup?.()
  Object.assign(hooks, { slots: [], cursor: 0, pending: [], dirty: false, result: null })
  Object.assign(mocks.state, { authCallback: null, reads: [], avatarResponse: null, lastAvatarArgs: null, selected: [], channels: [] })
  vi.clearAllMocks()
  vi.useFakeTimers()
  document.visibilityState = 'visible'
  render()
  await flush()
})

afterEach(() => {
  for (const slot of hooks.slots) slot?.cleanup?.()
  hooks.slots = []
  vi.useRealTimers()
})

describe('campus auth shared avatar synchronization', () => {
  it('loads updated_at with the basic owner profile', () => {
    expect(hooks.result.profile.user_id).toBe('member-a')
    expect(mocks.state.selected).toContain('user_id,nickname,avatar_path,updated_at')
  })

  it('saves a shared avatar through the profile service and updates auth identity', async () => {
    expect(typeof hooks.result.updateAvatar).toBe('function')
    const result = await hooks.result.updateAvatar('data:image/jpeg;base64,YWJj')
    await flush()
    expect(mocks.state.lastAvatarArgs).toMatchObject({ userId: 'member-a', image: 'data:image/jpeg;base64,YWJj' })
    expect(mocks.state.lastAvatarArgs.isCurrent()).toBe(true)
    expect(result.avatar_path).toBe('member-a/saved.jpg')
    expect(hooks.result.profile.avatar_path).toBe('member-a/saved.jpg')
  })

  it('leaves the displayed shared avatar unchanged on an upload failure', async () => {
    mocks.saveProfileAvatar.mockRejectedValueOnce(new Error('upload refused'))
    await expect(hooks.result.updateAvatar('image')).rejects.toThrow('upload refused')
    await flush()
    expect(hooks.result.profile.avatar_path).toBeNull()
  })

  it('invalidates an upload immediately when auth changes before React renders', async () => {
    const upload = deferred()
    mocks.state.avatarResponse = upload.promise
    const saving = hooks.result.updateAvatar('image')
    expect(mocks.state.lastAvatarArgs.isCurrent()).toBe(true)
    switchAccount('member-b')
    expect(mocks.state.lastAvatarArgs.isCurrent()).toBe(false)
    upload.resolve(mocks.row('member-a', 'member-a/saved.jpg', '2026-10-21T09:00:00Z'))
    await expect(saving).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(hooks.result.profile.user_id).toBe('member-b')
    expect(hooks.result.profile.avatar_path).toBeNull()
  })

  it('prevents a refresh started before an avatar save from restoring the old avatar', async () => {
    const oldRefresh = deferred()
    mocks.state.reads.push(oldRefresh.promise)
    const refreshing = hooks.result.refreshProfile()
    await hooks.result.updateAvatar('image')
    oldRefresh.resolve({ data: mocks.row('member-a'), error: null })
    await refreshing
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/saved.jpg')
  })

  it('rejects older server snapshots even from a refresh requested after saving', async () => {
    await hooks.result.updateAvatar('image')
    await flush()
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a'), error: null }))
    await hooks.result.refreshProfile()
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/saved.jpg')
  })

  it('does not revive an old account request after switching away and back', async () => {
    const oldRefresh = deferred()
    mocks.state.reads.push(oldRefresh.promise)
    const refreshing = hooks.result.refreshProfile()
    switchAccount('member-b')
    await flush()
    switchAccount('member-a')
    await flush()
    oldRefresh.resolve({ data: mocks.row('member-a', 'member-a/obsolete.jpg'), error: null })
    await refreshing
    await flush()
    expect(hooks.result.profile.avatar_path).toBeNull()
  })

  it('prevents a callback retained by an old account view from saving after a switch', async () => {
    const oldUpdate = hooks.result.updateAvatar
    switchAccount('member-b')
    await flush()
    await expect(oldUpdate('image')).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.saveProfileAvatar).not.toHaveBeenCalled()
  })

  it('passes an empty avatar to the same cloud service for reset', async () => {
    await hooks.result.updateAvatar('')
    expect(mocks.state.lastAvatarArgs.image).toBe('')
  })
})
describe('owner profile realtime and reconnect recovery', () => {
  it('subscribes only to changes for the current owner profile', () => {
    expect(mocks.state.channels).toHaveLength(1)
    expect(mocks.state.channels[0].filter).toMatchObject({ schema: 'public', table: 'profiles', event: 'UPDATE', filter: 'user_id=eq.member-a' })
  })

  it('reloads basic owner fields when the current owner changes on another device', async () => {
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/remote.jpg', '2026-10-21T10:00:00Z'), error: null }))
    mocks.state.channels[0].change({ new: { user_id: 'member-a', email: 'untrusted' } })
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/remote.jpg')
    expect(hooks.result.profile).not.toHaveProperty('email')
  })

  it('ignores a realtime payload for another owner without querying', async () => {
    const count = mocks.state.selected.length
    mocks.state.channels[0].change({ new: { user_id: 'member-b' } })
    await flush()
    expect(mocks.state.selected).toHaveLength(count)
  })

  it('rereads after SUBSCRIBED to recover changes missed during reconnect', async () => {
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/reconnected.jpg', '2026-10-21T10:00:00Z'), error: null }))
    mocks.state.channels[0].status('SUBSCRIBED')
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/reconnected.jpg')
  })

  it('rereads when the browser comes online', async () => {
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/online.jpg', '2026-10-21T10:00:00Z'), error: null }))
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/online.jpg')
  })

  it('rereads when returning to a visible page and pauses hidden polling', async () => {
    document.visibilityState = 'hidden'
    const count = mocks.state.selected.length
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
    expect(mocks.state.selected).toHaveLength(count)
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/visible.jpg', '2026-10-21T10:00:00Z'), error: null }))
    document.visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/visible.jpg')
  })

  it('rereads every 30 seconds as a fallback when realtime is unavailable', async () => {
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/polled.jpg', '2026-10-21T10:00:00Z'), error: null }))
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/polled.jpg')
  })

  it('removes the old subscription and rejects its queued callbacks when switching owners', async () => {
    const oldChannel = mocks.state.channels[0]
    switchAccount('member-b')
    oldChannel.change({ new: { user_id: 'member-a' } })
    await flush()
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(oldChannel)
    expect(mocks.state.channels).toHaveLength(2)
    expect(mocks.state.channels[1].filter.filter).toBe('user_id=eq.member-b')
    expect(hooks.result.profile.user_id).toBe('member-b')
  })

  it('cleans channels, listeners, polling and pending responses on unmount', async () => {
    const pending = deferred()
    mocks.state.reads.push(pending.promise)
    const refreshing = hooks.result.refreshProfile()
    const channel = mocks.state.channels[0]
    for (const slot of hooks.slots) slot?.cleanup?.()
    hooks.slots = []
    hooks.dirty = false
    const count = mocks.state.selected.length
    channel.change({ new: { user_id: 'member-a' } })
    channel.status('SUBSCRIBED')
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60000)
    pending.resolve({ data: mocks.row('member-a', 'member-a/late.jpg'), error: null })
    await refreshing
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel)
    expect(mocks.state.selected).toHaveLength(count)
    expect(hooks.dirty).toBe(false)
  })

  it('compares sub-millisecond timestamps across equivalent timezone offsets', async () => {
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/newer.jpg', '2026-10-21T18:00:00.123900+08:00'), error: null }))
    await hooks.result.refreshProfile()
    await flush()
    mocks.state.reads.push(Promise.resolve({ data: mocks.row('member-a', 'member-a/older.jpg', '2026-10-21T10:00:00.123800Z'), error: null }))
    await hooks.result.refreshProfile()
    await flush()
    expect(hooks.result.profile.avatar_path).toBe('member-a/newer.jpg')
  })
})
