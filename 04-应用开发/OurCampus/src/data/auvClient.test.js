import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }))
vi.mock('./supabaseClient.js', () => ({ requireSupabase: () => ({ auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession } }), normalizeSupabaseUrl: (value) => value }))
import { requestAuv } from './auvClient.js'
let fetcher
beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'test-user-token', user: { id: 'member-a' } } } })
  mocks.refreshSession.mockReset().mockRejectedValue(new Error('Unexpected refresh'))
  fetcher = vi.fn(async () => Response.json({ text: '测试回答' }))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => vi.unstubAllGlobals())
describe('AUV client context contract', () => {
  it('sends structured context using the deployed field and never sends the legacy favorites field', async () => {
    const context = { capturedAt: '2026-11-10T08:00:00.000Z', locationSource: 'unknown', favoriteIds: ['library'] }
    await requestAuv({ text: '这里有什么', mode: 'chat', locationId: 'library', history: [], context, favoriteLocationIds: ['old-id'], expectedUserId: 'member-a' })
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.context).toEqual(context)
    expect(body.locationId).toBe('library')
    expect(body).not.toHaveProperty('favoriteLocationIds')
    expect(body).not.toHaveProperty('expectedUserId')
  })
  it('does not send an old account context with a newly switched account token', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'other-test-token', user: { id: 'member-b' } } } })
    await expect(requestAuv({ text: '我的课表', mode: 'chat', expectedUserId: 'member-a', context: { capturedAt: '2026-11-10T08:00:00.000Z' } })).rejects.toThrow(/账号.*变化|重新/)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('retains requests without an optional context and rejects signed-out sessions', async () => {
    await requestAuv({ text: '你好', mode: 'chat' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('context')
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    await expect(requestAuv({ text: '你好', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/登录/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

const session = (id = 'member-a', token = 'test-user-token') => ({ data: { session: { access_token: token, user: { id } } }, error: null })
const unauthorized = () => Response.json({ error: { message: '登录已失效，请重新登录。' } }, { status: 401 })
function refreshToSameAccount() {
  mocks.refreshSession.mockImplementation(async () => {
    const next = session('member-a', 'refreshed-test-token')
    mocks.getSession.mockResolvedValue(next)
    return next
  })
}
describe('single 401 recovery', () => {
  it('refreshes only after 401 and resends the identical question/context once with the same actor', async () => {
    fetcher.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(Response.json({ text: '已恢复' }))
    refreshToSameAccount()
    const result = await requestAuv({ text: '我的下一节课', mode: 'chat', expectedUserId: 'member-a', context: { capturedAt: '2026-11-10T08:00:00.000Z', locationSource: 'unknown' } })
    expect(result.text).toBe('已恢复')
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body)
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-test-token')
  })
  it('does not retry a second 401 or refresh indefinitely', async () => {
    fetcher.mockImplementation(async () => unauthorized())
    refreshToSameAccount()
    await expect(requestAuv({ text: '我的下一节课', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/登录/)
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it.each([502, 503])('does not refresh or retry a %s provider/gateway error', async (status) => {
    fetcher.mockResolvedValue(Response.json({ error: { message: '服务暂不可用' } }, { status }))
    await expect(requestAuv({ text: '图书馆', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/不可用/)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSession).not.toHaveBeenCalled()
  })
  it('does not retry a network error that might have followed model processing', async () => {
    fetcher.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(requestAuv({ text: '图书馆', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/连不上/)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSession).not.toHaveBeenCalled()
  })
  it('rejects a switched or signed-out actor before trying to refresh', async () => {
    mocks.getSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session('member-b'))
    fetcher.mockResolvedValue(unauthorized())
    await expect(requestAuv({ text: '我的课表', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/账号.*变化|重新/)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSession).not.toHaveBeenCalled()
  })
  it.each([session('member-b'), { data: { session: null }, error: null }])('does not resend after refresh returns a different or missing actor', async (refreshed) => {
    mocks.refreshSession.mockResolvedValue(refreshed)
    fetcher.mockResolvedValue(unauthorized())
    await expect(requestAuv({ text: '我的课表', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/账号.*变化|登录|重新/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('checks the current session again after refresh before resending', async () => {
    mocks.getSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session()).mockResolvedValueOnce(session('member-b'))
    mocks.refreshSession.mockResolvedValue(session('member-a', 'refreshed-test-token'))
    fetcher.mockResolvedValue(unauthorized())
    await expect(requestAuv({ text: '我的课表', mode: 'chat', expectedUserId: 'member-a' })).rejects.toThrow(/账号.*变化|重新/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not resend after the page is closed while refresh is pending', async () => {
    const controller = new AbortController()
    mocks.refreshSession.mockImplementation(async () => { controller.abort(); return session('member-a', 'refreshed-test-token') })
    fetcher.mockResolvedValue(unauthorized())
    await expect(requestAuv({ text: '我的课表', mode: 'chat', expectedUserId: 'member-a' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
