import { describe, expect, it } from 'vitest'
import { createNoticeQueue, refreshNoticeQueue, dismissNotice, visibleNotice } from './noticeQueue.js'

const old = { id: 'old', recipient_id: 'a', created_at: '2026-11-08T01:00:00Z' }
const fresh = { id: 'new', recipient_id: 'a', created_at: '2026-11-08T01:00:01Z', priority: 1 }
const baseline = () => refreshNoticeQueue(createNoticeQueue('a'), 'a', [old])
describe('前台提醒待展示队列', () => {
  it('首次只建立基线，不补弹历史未读', () => {
    const state = baseline()
    expect(state.pending).toEqual([])
    expect(visibleNotice(state, 'a', true, false)).toBeNull()
  })
  it.each([[false, false], [true, true]])('隐藏或遮挡时保留待显示提醒，恢复后再显示 visible=%s covered=%s', (visible, covered) => {
    const state = refreshNoticeQueue(baseline(), 'a', [old, fresh])
    expect(visibleNotice(state, 'a', visible, covered)).toBeNull()
    expect(state.pending.map(n => n.id)).toEqual(['new'])
    expect(visibleNotice(state, 'a', true, false)?.id).toBe('new')
  })
  it('重复刷新不会重复入队，新提醒按优先级排列', () => {
    const urgent = { ...fresh, id: 'urgent', priority: 3 }
    const state = refreshNoticeQueue(baseline(), 'a', [old, fresh, urgent])
    const repeated = refreshNoticeQueue(state, 'a', [old, fresh, urgent])
    expect(repeated.pending.map(n => n.id)).toEqual(['urgent', 'new'])
  })
  it('已读和已删除的排队提醒被移除', () => {
    const state = refreshNoticeQueue(baseline(), 'a', [old, fresh])
    expect(refreshNoticeQueue(state, 'a', [old, { ...fresh, read_at: 'read' }]).pending).toEqual([])
    expect(refreshNoticeQueue(state, 'a', [old]).pending).toEqual([])
  })
  it('关闭一条不标已读，继续显示下一条，刷新不重新加入', () => {
    const next = { ...fresh, id: 'next', priority: 2 }
    const state = refreshNoticeQueue(baseline(), 'a', [old, fresh, next])
    const dismissed = dismissNotice(state, 'a', 'next')
    expect(dismissed.pending.map(n => n.id)).toEqual(['new'])
    expect(next.read_at).toBeUndefined()
    expect(refreshNoticeQueue(dismissed, 'a', [old, fresh, next]).pending.map(n => n.id)).toEqual(['new'])
  })
  it('退出或切换账号立即隐藏并清空，不接收上一账号快照', () => {
    const state = refreshNoticeQueue(baseline(), 'a', [old, fresh])
    expect(visibleNotice(state, 'b', true, false)).toBeNull()
    expect(refreshNoticeQueue(state, null, []).pending).toEqual([])
    const other = refreshNoticeQueue(state, 'b', [old, fresh])
    expect(other.ownerId).toBe('b')
    expect(other.pending).toEqual([])
    expect(dismissNotice(other, 'a', 'new')).toBe(other)
  })
})
