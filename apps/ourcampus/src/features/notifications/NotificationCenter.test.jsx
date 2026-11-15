import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as notifications from './NotificationCenter.jsx'

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
