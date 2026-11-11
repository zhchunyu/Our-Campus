import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const current = vi.hoisted(() => ({ value: null }))
vi.mock('./useAiReminderPreferences.js', () => ({ useAiReminderPreferences: () => current.value }))
import { AiChatReminderPreferences } from './NotificationPreferences.jsx'
const defaults = { enabled: false, use_favorites: true, match_lost: true, interest_keywords: [] }
beforeEach(() => { current.value = { status: 'ready', value: defaults, error: '', save: vi.fn(), refresh: vi.fn() } })
describe('public chat relevance reminder consent', () => {
  it('presents a separate off-by-default choice with explicit matching criteria', () => {
    const html = renderToStaticMarkup(<AiChatReminderPreferences userId="user" run={vi.fn()} />)
    expect(html).toContain('相关聊天提醒')
    expect(html).toContain('默认关闭')
    expect(html).toContain('已同步的收藏地点')
    expect(html).toContain('最多 8 个')
    expect(html).toContain('每个 2–16 字')
    expect(html).toContain('未经核实')
    expect(html.match(/checked=""/g)).toHaveLength(2)
  })
  it('disables changes while loading or saving and exposes upgrade errors with a retry', () => {
    current.value = { ...current.value, status: 'unavailable', error: '相关聊天提醒服务尚未升级，请稍后再试。' }
    const html = renderToStaticMarkup(<AiChatReminderPreferences userId="user" run={vi.fn()} />)
    expect(html).toContain('尚未升级')
    expect(html).toContain('重新读取')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('checked="" value="enabled"')
  })
})
