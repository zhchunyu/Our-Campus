import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemberProfileLoader, MemberProfileContent } from './MemberProfilePage.jsx'

vi.mock('../../data/memberProfiles.js', () => ({ getMemberProfile: vi.fn(), getAvatarUrl: () => '' }))
const userId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const message = { imagePaths: [], id: messageId, authorId: userId, content: '明天一起去图书馆', regionId: 'teaching', createdAt: '2026-10-21T04:00:00Z', deletedAt: null }
const profile = { user_id: userId, nickname: '青禾', avatar_path: null, email: 'private@example.com', bio: '秘密签名', tags: ['秘密标签'] }
const ready = { profile, messages: [message], profileStatus: 'ready', messagesStatus: 'ready', profileError: '', messagesError: '' }
const render = (state) => renderToStaticMarkup(<MemberProfileContent state={state} onRetry={() => {}} />)
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }


describe('member public profile content', () => {
  it('renders only nickname, avatar and public hall messages', () => {
    const html = render(ready)
    expect(html).toContain('青禾')
    expect(html).toContain('明天一起去图书馆')
    expect(html).toContain('教学区')
    expect(html).not.toMatch(/private@example|秘密签名|秘密标签|我的课表|我的收藏|登录邮箱/)
    expect(html).not.toMatch(/<form|<input|contenteditable/)
  })

  it('shows explicit loading, missing profile, error/retry and empty message states', () => {
    expect(render({ ...ready, profile: null, profileStatus: 'loading' })).toContain('正在加载成员资料')
    expect(render({ ...ready, profile: null, profileStatus: 'notfound' })).toContain('未找到这位成员')
    expect(render({ ...ready, profile: null, profileStatus: 'error', profileError: '资料加载失败' })).toContain('重试')
    expect(render({ ...ready, messages: [], messagesStatus: 'ready' })).toContain('还没有公开的大厅发言')
    expect(render({ ...ready, messages: [], messagesStatus: 'error', messagesError: '消息加载失败' })).toContain('消息加载失败')
  })
})

describe('member profile request lifetime', () => {
  it('ignores old responses and preserves loaded content during refresh', async () => {
    const first = deferred()
    const states = []
    const loadProfile = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ...profile, nickname: '新昵称' })
    const loader = createMemberProfileLoader({ userId, loadProfile, loadMessages: async () => [message], onChange: (state) => states.push(state) })
    const oldRequest = loader.refresh()
    await loader.refresh()
    first.resolve(profile)
    await oldRequest
    expect(states.at(-1).profile.nickname).toBe('新昵称')
    const later = deferred()
    loadProfile.mockReturnValueOnce(later.promise)
    const refresh = loader.refresh()
    expect(states.at(-1).profile.nickname).toBe('新昵称')
    expect(states.at(-1).messages).toEqual([message])
    later.resolve(profile)
    await refresh
  })

  it('removes retractions immediately and never resurrects them from an in-flight snapshot', async () => {
    const pending = deferred()
    const states = []
    const loadMessages = vi.fn().mockResolvedValueOnce([message]).mockReturnValueOnce(pending.promise)
    const loader = createMemberProfileLoader({ userId, loadProfile: async () => profile, loadMessages, onChange: (state) => states.push(state) })
    await loader.refresh()
    const refresh = loader.refresh()
    loader.handleHallChange({ eventType: 'UPDATE', new: { id: messageId, author_id: userId, deleted_at: '2026-10-21T05:00:00Z' } })
    expect(states.at(-1).messages).toEqual([])
    pending.resolve([message])
    await refresh
    expect(states.at(-1).messages).toEqual([])
  })

  it('keeps live inserts received after a read started and stops all changes after dispose', async () => {
    const pending = deferred()
    const states = []
    const loader = createMemberProfileLoader({ userId, loadProfile: async () => profile, loadMessages: () => pending.promise, onChange: (state) => states.push(state) })
    const refresh = loader.refresh()
    loader.handleHallChange({ eventType: 'INSERT', new: { id: messageId, author_id: userId, content: message.content, region_id: message.regionId, created_at: message.createdAt, deleted_at: null } })
    pending.resolve([])
    await refresh
    expect(states.at(-1).messages).toEqual([message])
    loader.dispose()
    const count = states.length
    loader.handleHallChange({ eventType: 'DELETE', old: { id: messageId } })
    await loader.refresh()
    expect(states).toHaveLength(count)
  })
})

it('ignores both profile and message replies received after the page closes', async () => {
  const pendingProfile = deferred()
  const pendingMessages = deferred()
  const states = []
  const loader = createMemberProfileLoader({ userId, loadProfile: () => pendingProfile.promise, loadMessages: () => pendingMessages.promise, onChange: (state) => states.push(state) })
  const refresh = loader.refresh()
  loader.dispose()
  const count = states.length
  pendingProfile.resolve(profile)
  pendingMessages.resolve([message])
  await refresh
  expect(states).toHaveLength(count)
})

it('keeps the newest 20 live messages in descending time and ID order', () => {
  const states = []
  const loader = createMemberProfileLoader({ userId, onChange: (state) => states.push(state) })
  for (let index = 1; index <= 24; index += 1) loader.handleHallChange({ eventType: 'INSERT', new: { id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, author_id: userId, content: `发言${index}`, region_id: 'teaching', created_at: '2026-10-21T04:00:00.123456Z', deleted_at: null } })
  expect(states.at(-1).messages).toHaveLength(20)
  expect(states.at(-1).messages[0].content).toBe('发言24')
  expect(states.at(-1).messages.at(-1).content).toBe('发言5')
  loader.dispose()
})

it('retains current public content when a refresh fails and reports both retryable errors', async () => {
  const states = []
  const loadProfile = vi.fn().mockResolvedValueOnce(profile).mockRejectedValueOnce(new Error('unavailable'))
  const loadMessages = vi.fn().mockResolvedValueOnce([message]).mockRejectedValueOnce(new Error('unavailable'))
  const loader = createMemberProfileLoader({ userId, loadProfile, loadMessages, onChange: (state) => states.push(state) })
  await loader.refresh()
  await loader.refresh()
  expect(states.at(-1).profile).toEqual(profile)
  expect(states.at(-1).messages).toEqual([message])
  expect(states.at(-1).profileStatus).toBe('error')
  expect(states.at(-1).messagesStatus).toBe('error')
  const html = render(states.at(-1))
  expect(html).toContain('青禾')
  expect(html).toContain('明天一起去图书馆')
  expect(html.match(/class="member-profile__retry"/g)).toHaveLength(2)
  loader.dispose()
})
