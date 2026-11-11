import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ hooks: [], index: 0, effects: [], handlers: {}, channels: [], list: vi.fn(), profiles: vi.fn(), hydrate: vi.fn(), send: vi.fn(), removeChannel: vi.fn() }))
vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useRef: (initial) => {
    const index = mocks.index++
    return mocks.hooks[index] ??= { current: initial }
  },
  useState: (initial) => {
    const index = mocks.index++
    const hook = mocks.hooks[index] ??= { value: initial }
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
vi.mock('../../data/supabaseClient.js', () => {
  const client = {
    channel: () => {
      const handlers = {}
      const channel = { handlers, on: (_event, filter, callback) => { handlers[filter.table] = callback; return channel }, subscribe: (callback) => { channel.status = callback; return channel } }
      mocks.channels.push(channel)
      mocks.handlers = handlers
      return channel
    },
    removeChannel: mocks.removeChannel,
  }
  return { supabase: client, requireSupabase: () => client, describeServerError: (_error, fallback) => fallback }
})
vi.mock('../../data/memberProfiles.js', () => ({
  getAvatarUrl: (path) => path ? `https://campus.test/${path}` : '',
  listMemberProfiles: mocks.profiles,
}))
vi.mock('../../data/hallService.js', async (importOriginal) => ({
  ...await importOriginal(),
  listHallMessages: mocks.list,
  hydrateHallMessages: mocks.hydrate, sendHallMessage: mocks.send,
}))
import { toHallMessage } from '../../data/hallService.js'
import { useRealtimeHall } from './useRealtimeHall.js'

const authorA = '11111111-1111-4111-8111-111111111111'
const authorB = '22222222-2222-4222-8222-222222222222'
const oldProfile = { user_id: authorB, nickname: '旧昵称', avatar_path: `${authorB}/old.webp`, updated_at: '2026-10-21T02:00:00.123400+00:00' }
const newProfile = { ...oldProfile, nickname: '新昵称', avatar_path: `${authorB}/new.webp`, updated_at: '2026-10-21T02:00:00.123401+00:00' }
const message = (id, authorId, profile = null) => toHallMessage({ id, author_id: authorId, region_id: 'library', content: id, created_at: id === 'latest' ? '2026-10-21T01:00:00Z' : '2026-10-01T01:00:00Z', deleted_at: null }, profile)
const page = (messages, hasMore = false) => ({ messages, before: { id: messages[0]?.id, createdAt: messages[0]?.createdAt }, hasMore })
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() }
function render(userId = authorA, regionId = 'all') {
  mocks.index = 0
  const result = useRealtimeHall({ userId, regionId })
  const effects = mocks.effects.splice(0)
  effects.forEach((effect) => effect())
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.hooks = []; mocks.index = 0; mocks.effects = []; mocks.handlers = {}; mocks.channels = []
  mocks.list.mockReset().mockResolvedValue(page([message('latest', authorA)], true))
  mocks.profiles.mockReset().mockResolvedValue([])
  mocks.hydrate.mockReset(); mocks.send.mockReset()
  mocks.removeChannel.mockReset()
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', new EventTarget())
  const document = new EventTarget()
  document.visibilityState = 'visible'
  vi.stubGlobal('document', document)
})
afterEach(() => {
  mocks.hooks.forEach((hook) => hook.cleanup?.())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('hall profile synchronization', () => {
  it('updates every loaded older message when an author profile changes', async () => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old-1', authorB, oldProfile), message('old-2', authorB, oldProfile)]))
    await render().loadOlder()
    expect(mocks.handlers.profiles).toBeTypeOf('function')
    mocks.handlers.profiles({ eventType: 'UPDATE', new: { ...newProfile, email: 'private' } })
    const older = render().messages.filter((entry) => entry.authorId === authorB)
    expect(older).toHaveLength(2)
    expect(older.every((entry) => entry.author === '新昵称' && entry.authorAvatarPath === newProfile.avatar_path)).toBe(true)
    expect(older[0]).not.toHaveProperty('email')
  })

  it('polls profiles for authors from loaded older pages as well as the latest page', async () => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old', authorB, oldProfile)]))
    await render().loadOlder()
    mocks.profiles.mockResolvedValue([newProfile])
    await vi.advanceTimersByTimeAsync(30000)
    expect(mocks.profiles).toHaveBeenLastCalledWith(expect.arrayContaining([authorA, authorB]))
    expect(render().messages.find((entry) => entry.id === 'old')).toMatchObject({ author: '新昵称', authorAvatarPath: newProfile.avatar_path })
  })

  it('keeps a realtime profile change when an older history page finishes later', async () => {
    render(); await settle()
    const older = deferred()
    mocks.list.mockReturnValueOnce(older.promise)
    const loading = render().loadOlder()
    expect(mocks.handlers.profiles).toBeTypeOf('function')
    mocks.handlers.profiles({ eventType: 'UPDATE', new: newProfile })
    older.resolve(page([message('old', authorB, oldProfile)]))
    await loading
    expect(render().messages.find((entry) => entry.id === 'old')).toMatchObject({ author: '新昵称', authorAvatarPath: newProfile.avatar_path })
  })

  it('retains loaded messages and shows a retryable profile error when a repair read fails', async () => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old', authorB, oldProfile)]))
    await render().loadOlder()
    mocks.profiles.mockRejectedValueOnce(new Error('network'))
    await vi.advanceTimersByTimeAsync(30000)
    expect(render().messages.map((entry) => entry.id)).toEqual(['old', 'latest'])
    expect(render().error).toContain('资料')
  })

  it('does not resurrect a withdrawn message from a late page after a profile change', async () => {
    render(); await settle()
    const older = deferred()
    mocks.list.mockReturnValueOnce(older.promise)
    const loading = render().loadOlder()
    mocks.handlers.hall_messages({ eventType: 'DELETE', old: { id: 'old' } })
    older.resolve(page([message('old', authorB, oldProfile)]))
    await loading
    expect(render().messages.map((entry) => entry.id)).toEqual(['latest'])
  })

  it('discards pending pages and profile requests after an account or region switch', async () => {
    const previous = deferred()
    mocks.list.mockReturnValueOnce(previous.promise)
    render()
    render(authorB, 'library'); await settle()
    previous.resolve(page([message('wrong-account', authorB, oldProfile)]))
    await settle()
    expect(render(authorB, 'library').messages.map((entry) => entry.id)).toEqual(['latest'])
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1)
  })
})


describe('hall repair and connection races', () => {
  it.each(['online', 'visibilitychange', 'reconnect'])('repairs every loaded author after %s', async (trigger) => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old', authorB, oldProfile)]))
    await render().loadOlder()
    if (trigger === 'reconnect') mocks.channels[0].status('SUBSCRIBED')
    else if (trigger === 'online') window.dispatchEvent(new Event('online'))
    else document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(mocks.profiles).toHaveBeenLastCalledWith(expect.arrayContaining([authorA, authorB]))
  })

  it('ignores an older repair query that resolves after a realtime profile change', async () => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old', authorB, oldProfile)]))
    await render().loadOlder()
    const repair = deferred()
    mocks.profiles.mockReturnValueOnce(repair.promise)
    await vi.advanceTimersByTimeAsync(30000)
    mocks.handlers.profiles({ eventType: 'UPDATE', new: newProfile })
    repair.resolve([oldProfile]); await settle()
    expect(render().messages.find((entry) => entry.id === 'old')).toMatchObject({ author: '新昵称', authorAvatarPath: newProfile.avatar_path })
  })

  it('uses the default author after deletion even when an earlier page later supplies a profile', async () => {
    render(); await settle()
    const older = deferred()
    mocks.list.mockReturnValueOnce(older.promise)
    const loading = render().loadOlder()
    mocks.handlers.profiles({ eventType: 'DELETE', old: { user_id: authorB } })
    older.resolve(page([message('old', authorB, oldProfile)])); await loading
    expect(render().messages.find((entry) => entry.id === 'old')).toMatchObject({ author: '校园同学', authorAvatarPath: null, authorAvatarUrl: '' })
  })

  it('discards pending profile repairs after the viewer changes', async () => {
    render(); await settle()
    mocks.list.mockResolvedValueOnce(page([message('old', authorB, oldProfile)]))
    await render().loadOlder()
    const repair = deferred()
    mocks.profiles.mockReturnValueOnce(repair.promise)
    await vi.advanceTimersByTimeAsync(30000)
    mocks.list.mockResolvedValueOnce(page([message('other-account', authorB, oldProfile)]))
    render(authorB); await settle()
    repair.resolve([newProfile]); await settle()
    expect(render(authorB).messages).toHaveLength(1)
    expect(render(authorB).messages[0]).toMatchObject({ id: 'other-account', author: '旧昵称' })
  })

  it('does not merge a delayed send into a newly created connection with the same identity', async () => {
    render(); await settle()
    const send = deferred()
    mocks.send.mockReturnValueOnce(send.promise)
    const sending = render().sendMessage({ content: '迟到发送', regionId: 'library' })
    render(authorB); await settle()
    render(authorA); await settle()
    send.resolve(message('old-connection-send', authorA)); await sending
    expect(render().messages.map((entry) => entry.id)).toEqual(['latest'])
  })
})

it('reuses image message id for retry and starts a new id when the attachments change', async () => {
 render(); await settle()
 const firstPath = `${authorA}/44444444-4444-4444-8444-444444444444.jpg`
 const secondPath = `${authorA}/55555555-5555-4555-8555-555555555555.jpg`
 mocks.send.mockRejectedValue(new Error('offline'))
 await expect(render().sendMessage({ content: '', regionId: 'library', imagePaths: [firstPath] })).rejects.toThrow()
 await expect(render().sendMessage({ content: '', regionId: 'library', imagePaths: [firstPath] })).rejects.toThrow()
 await expect(render().sendMessage({ content: '', regionId: 'library', imagePaths: [secondPath] })).rejects.toThrow()
 const attempts = mocks.send.mock.calls.map(([input]) => input)
 expect(attempts[0].imagePaths).toEqual([firstPath])
 expect(attempts[0].clientMessageId).toBe(attempts[1].clientMessageId)
 expect(attempts[2].clientMessageId).not.toBe(attempts[1].clientMessageId)
})
