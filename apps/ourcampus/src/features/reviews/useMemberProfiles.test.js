import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ hooks: [], index: 0, effects: [], channels: [], profiles: vi.fn(), removeChannel: vi.fn() }))
vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useMemo: (factory) => factory(),
  useRef: (initial) => {
    const index = mocks.index++
    return mocks.hooks[index] ??= { current: initial }
  },
  useState: (initial) => {
    const index = mocks.index++
    const hook = mocks.hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [hook.value, (next) => { hook.value = typeof next === 'function' ? next(hook.value) : next }]
  },
  useEffect: (effect, deps) => {
    const index = mocks.index++
    const previous = mocks.hooks[index]
    if (!previous || deps.some((value, position) => value !== previous.deps[position])) mocks.effects.push(() => {
      previous?.cleanup?.()
      mocks.hooks[index] = { deps, cleanup: effect() }
    })
  },
}))
vi.mock('../../data/memberProfiles.js', () => ({ listMemberProfiles: mocks.profiles }))
vi.mock('../../data/supabaseClient.js', () => ({
  describeServerError: (_error, fallback) => fallback,
  supabase: {
    channel: () => {
      const channel = { on: (_event, _filter, callback) => { channel.onChange = callback; return channel }, subscribe: (callback) => { channel.onStatus = callback; return channel } }
      mocks.channels.push(channel)
      return channel
    },
    removeChannel: mocks.removeChannel,
  },
}))
import { useMemberProfiles } from './useMemberProfiles.js'

const viewerA = '11111111-1111-4111-8111-111111111111'
const authorA = '22222222-2222-4222-8222-222222222222'
const authorB = '33333333-3333-4333-8333-333333333333'
const oldProfile = { user_id: authorA, nickname: '旧昵称', avatar_path: `${authorA}/old.webp`, updated_at: '2026-10-21T02:00:00Z' }
const newProfile = { ...oldProfile, nickname: '新昵称', avatar_path: `${authorA}/new.webp`, updated_at: '2026-10-22T02:00:00Z' }
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() }
function render(userIds = [authorA], ...viewers) {
  const viewerId = viewers.length ? viewers[0] : viewerA
  mocks.index = 0
  const result = useMemberProfiles({ userIds, viewerId })
  mocks.effects.splice(0).forEach((effect) => effect())
  return result
}
function unmount() { mocks.hooks.forEach((hook) => hook.cleanup?.()) }

beforeEach(() => {
  vi.useFakeTimers()
  mocks.hooks = []; mocks.index = 0; mocks.effects = []; mocks.channels = []
  mocks.profiles.mockReset().mockResolvedValue([oldProfile])
  mocks.removeChannel.mockReset()
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', new EventTarget())
  const document = new EventTarget()
  document.visibilityState = 'visible'
  vi.stubGlobal('document', document)
})
afterEach(() => { unmount(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('loaded review author profile synchronization', () => {
  it('deduplicates valid authors and refreshes profiles from every loaded page', async () => {
    render([authorA, authorA, 'local-author']); await settle()
    expect(mocks.profiles).toHaveBeenLastCalledWith([authorA])
    expect(render().profiles[authorA]).toMatchObject(oldProfile)
    render([authorA, authorB, authorA]); await settle()
    mocks.profiles.mockResolvedValue([newProfile, { ...oldProfile, user_id: authorB }])
    await vi.advanceTimersByTimeAsync(30000)
    expect(mocks.profiles).toHaveBeenLastCalledWith([authorA, authorB])
    expect(render([authorA, authorB]).profiles[authorA]).toMatchObject(newProfile)
  })

  it('repairs profile changes on realtime, reconnect, online, and visible events', async () => {
    render(); await settle()
    mocks.profiles.mockResolvedValue([newProfile])
    mocks.channels.at(-1).onChange({ eventType: 'UPDATE', new: newProfile })
    await settle()
    expect(render().profiles[authorA]).toMatchObject(newProfile)
    const count = mocks.profiles.mock.calls.length
    mocks.channels.at(-1).onStatus('SUBSCRIBED'); await settle()
    window.dispatchEvent(new Event('online')); await settle()
    document.dispatchEvent(new Event('visibilitychange')); await settle()
    expect(mocks.profiles.mock.calls.length).toBe(count + 3)
  })

  it('preserves loaded profiles with an explicit retryable error if a refresh fails', async () => {
    render(); await settle()
    mocks.profiles.mockRejectedValueOnce(new Error('network failed'))
    await render().refresh()
    expect(render()).toMatchObject({ profiles: { [authorA]: oldProfile }, error: '评价作者资料同步失败，请重试' })
    mocks.profiles.mockResolvedValue([newProfile])
    await render().refresh()
    expect(render()).toMatchObject({ profiles: { [authorA]: newProfile }, error: '' })
  })

  it('ignores older requests after a newer repair has finished', async () => {
    const oldRead = deferred()
    mocks.profiles.mockReturnValueOnce(oldRead.promise)
    render()
    mocks.profiles.mockResolvedValue([newProfile])
    await render().refresh()
    oldRead.resolve([oldProfile]); await settle()
    expect(render().profiles[authorA]).toMatchObject(newProfile)
  })

  it('isolates late reads and listeners across account switches and unmounts', async () => {
    const oldRead = deferred()
    mocks.profiles.mockReturnValueOnce(oldRead.promise)
    render()
    const previousChannel = mocks.channels.at(-1)
    mocks.profiles.mockResolvedValue([])
    expect(render([authorB], authorB).profiles).toEqual({})
    await settle()
    oldRead.resolve([oldProfile]); await settle()
    expect(render([authorB], authorB).profiles).toEqual({})
    expect(mocks.removeChannel).toHaveBeenCalledWith(previousChannel)
    const lastRead = deferred()
    mocks.profiles.mockReturnValueOnce(lastRead.promise)
    render([authorB], authorB).refresh()
    unmount()
    const snapshot = JSON.stringify(mocks.hooks.map((hook) => hook.value))
    lastRead.resolve([{ ...oldProfile, user_id: authorB }]); await settle()
    previousChannel.onChange({ new: oldProfile })
    expect(JSON.stringify(mocks.hooks.map((hook) => hook.value))).toBe(snapshot)
  })
})

describe('review profiles require a signed-in viewer', () => {
  it.each([undefined, null, '', 'guest', 'not-a-uuid', '11111111-1111-4111-8111-111111111111.extra', 123])('keeps guest or invalid viewer %s free of profile requests and repair resources', async (viewer) => {
    const onWindow = vi.spyOn(window, 'addEventListener')
    const onDocument = vi.spyOn(document, 'addEventListener')
    mocks.profiles.mockRejectedValue(new Error('permission denied'))
    render([authorA], viewer); await settle()
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60000)
    await render([authorA], viewer).refresh()
    expect(render([authorA], viewer)).toMatchObject({ profiles: {}, error: '' })
    expect(mocks.profiles).not.toHaveBeenCalled()
    expect(mocks.channels).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(onWindow).not.toHaveBeenCalled()
    expect(onDocument).not.toHaveBeenCalled()
  })

  it('invalidates retained signed-in repair callbacks as soon as a guest view renders', async () => {
    render(); await settle()
    const retained = render()
    const channel = mocks.channels.at(-1)
    const reads = mocks.profiles.mock.calls.length
    mocks.index = 0
    const guest = useMemberProfiles({ userIds: [authorA], viewerId: null })
    expect(guest).toMatchObject({ profiles: {}, error: '' })
    await retained.refresh()
    channel.onChange({ new: newProfile })
    await settle()
    expect(mocks.profiles).toHaveBeenCalledTimes(reads)
    mocks.effects.splice(0).forEach((effect) => effect())
  })
  it('starts profile synchronization after login and removes it on logout', async () => {
    render([authorA], null); await settle()
    expect(mocks.profiles).not.toHaveBeenCalled()
    render(); await settle()
    expect(render().profiles[authorA]).toMatchObject(oldProfile)
    const signedIn = render()
    const channel = mocks.channels.at(-1)
    const reads = mocks.profiles.mock.calls.length
    expect(render([authorA], null)).toMatchObject({ profiles: {}, error: '' })
    await signedIn.refresh()
    channel.onChange({ new: newProfile }); channel.onStatus('SUBSCRIBED')
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(mocks.profiles).toHaveBeenCalledTimes(reads)
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel)
    expect(vi.getTimerCount()).toBe(0)
    expect(render([authorA], null)).toMatchObject({ profiles: {}, error: '' })
  })

  it.each(['resolve', 'reject'])('ignores a late %s after logout and restores signed-in synchronization', async (outcome) => {
    const pending = deferred()
    mocks.profiles.mockReturnValueOnce(pending.promise)
    render()
    expect(render([authorA], null)).toMatchObject({ profiles: {}, error: '' })
    if (outcome === 'resolve') pending.resolve([oldProfile])
    else pending.reject(new Error('permission denied'))
    await settle()
    expect(render([authorA], null)).toMatchObject({ profiles: {}, error: '' })
    mocks.profiles.mockResolvedValue([newProfile])
    expect(render([authorA], authorB).profiles).toEqual({})
    await settle()
    expect(render([authorA], authorB)).toMatchObject({ profiles: { [authorA]: newProfile }, error: '' })
  })

  it('clears profiles immediately when switching viewers for the same authors', async () => {
    render(); await settle()
    expect(render().profiles[authorA]).toMatchObject(oldProfile)
    const nextRead = deferred()
    mocks.profiles.mockReturnValueOnce(nextRead.promise)
    expect(render([authorA], authorB)).toMatchObject({ profiles: {}, error: '' })
    nextRead.resolve([newProfile]); await settle()
    expect(render([authorA], authorB).profiles[authorA]).toMatchObject(newProfile)
  })
})
