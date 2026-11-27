import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as notifications from './NotificationCenter.jsx'

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => ({}) }))

const noop = () => {}
const defaults = { auth: { user: { id: 'me' }, role: 'member' },
  information: { reports: [], notices: [], subscriptions: [], events: [], status: 'ready', unread: 0 },
  push: { status: {} }, locations: [], favoriteIds: [], onClose: noop, onOpenLogin: noop, onOpenChat: noop }
const notice = { type: 'hall-message', related_type: 'message', related_id: 'original' }
const target = { id: 'original', region_id: 'living', content: '原消息' }

describe('notification destinations', () => {
  it('exposes reminders, the shared chat entrance, and my cloud reports', () => {
    const html = renderToStaticMarkup(<notifications.NotificationCenter {...defaults} />)
    expect(html).toContain('aria-label="消息分类"')
    for (const label of ['提醒', '地区聊天', '我的上报', '通知设置']) expect(html).toContain(label)
    expect(html).not.toContain('待审核信息')
  })

  it('opens a validated chat source with its original message id', () => {
    const open = vi.fn()
    expect(notifications.HallNotificationSourceAction).toBeTypeOf('function')
    const action = notifications.HallNotificationSourceAction({ notice, target, onOpenChat: open })
    action.props.onClick()
    expect(open).toHaveBeenCalledWith('living', 'original')
  })

  it('does not offer a source link for withdrawn, mismatched, or absent messages', () => {
    expect(notifications.HallNotificationSourceAction).toBeTypeOf('function')
    for (const unavailable of [null, { ...target, deleted_at: '2026-11-15' }, { ...target, id: 'other' }]) {
      expect(notifications.HallNotificationSourceAction({ notice, target: unavailable, onOpenChat: noop })).toBeNull()
    }
  })
})

describe('Android notification settings', () => {
  const eligible = { configured: true, enabled: true, permission: 'granted', cid: 'test-device' }
  const settings = (push) => renderToStaticMarkup(<notifications.NotificationCenter {...defaults} initialTab="subscriptions" push={push} />)

  it('distinguishes system permission, provider, and server registration', () => {
    expect(settings({ status: { ...eligible, permission: 'denied' } })).toContain('系统通知权限未开启')
    expect(settings({ status: { ...eligible, cid: '' } })).toContain('正在等待个推提供设备标识')
    expect(settings({ status: eligible, registration: 'registering' })).toContain('正在向服务端登记此设备')
    expect(settings({ status: eligible, registration: 'failed' })).toContain('重试设备登记')
    expect(settings({ status: eligible, registration: 'registered' })).toContain('当前账号的设备通知已登记')
  })
})
