import { describe, expect, it } from 'vitest'
import { evaluateLostFoundMatch, rankLostFoundMatches } from '../../supabase/functions/_shared/lost-found-matching.js'
import { collectNewNotices, orderRelevantNotices } from './notificationRelevance.js'

const now = Date.parse('2026-10-15T04:00:00Z')
const lost = { id: 'lost-a', author_id: 'a', kind: 'lost', status: 'analyzed', title: '寻找白色耳机', body: '图书馆丢了白色耳机', location_id: 'library', created_at: '2026-10-15T01:00:00Z', details: { occurred_at: '2026-10-15T00:00:00Z' } }
const found = { id: 'found-b', author_id: 'b', kind: 'found', status: 'submitted', title: '捡到白色蓝牙耳机', body: '白色耳机一副', location_id: 'library', created_at: '2026-10-15T02:00:00Z', details: { occurred_at: '2026-10-15T01:00:00Z' } }
describe('失物线索', () => {
  it('白色耳机形成可解释线索，跨地点也允许但提示核对', () => {
    const match = evaluateLostFoundMatch(lost, { ...found, location_id: 'canteen' }, now)
    expect(match.reasons).toContain('描述均有白色')
    expect(match.warnings.join('')).toContain('地点不同')
    expect(match.warnings.join('')).toContain('不代表已确认归属')
  })
  it.each([
    { title: '黑色耳机', body: '黑色耳机' }, { title: '白色手机', body: '捡到白色手机' },
    { author_id: 'a' }, { status: 'resolved' }, { status: 'withdrawn' }, { kind: 'lost' },
    { details: { occurred_at: '2026-10-14T00:00:00Z' } }, { created_at: '2026-08-01T00:00:00Z' },
  ])('排除冲突、本人、无效发布及时间不合的线索：%j', (patch) => {
    expect(evaluateLostFoundMatch(lost, { ...found, ...patch }, now)).toBeNull()
  })
  it('泛泛的物品名不足以跨地点提醒，AI 编造关键词也不能增加证据', () => {
    const a = { ...lost, title: '耳机丢失', body: '耳机', details: {}, analysis: { keywords: ['星星挂件'] } }
    const b = { ...found, title: '蓝牙耳机', body: '耳机', location_id: 'canteen', details: {} }
    expect(evaluateLostFoundMatch(a, b, now)).toBeNull()
  })
  it('收纳盒颜色不掩盖物品主色冲突', () => {
    const a = { ...lost, body: '白色耳机，放在黑色收纳盒里' }
    const b = { ...found, title: '黑色耳机', body: '捡到黑色耳机' }
    expect(evaluateLostFoundMatch(a, b, now)).toBeNull()
  })
  it('描述里顺带提到手机，不会把丢失耳机匹配成手机', () => {
    const a = { ...lost, body: '白色耳机，曾经用手机拍了照片' }
    const b = { ...found, title: '白色手机', body: '白色手机一部' }
    expect(evaluateLostFoundMatch(a, b, now)).toBeNull()
  })
  it('只返回有效候选，最多五条', () => {
    expect(rankLostFoundMatches(lost, [found, { ...found, id: 'bad', status: 'resolved' }], now).map((m) => m.report_id)).toEqual(['found-b'])
  })
})
describe('相关通知呈现', () => {
  const notices = [
    { id: 'old', priority: 3, read_at: 'read', created_at: '2026-10-14T00:00:00Z' },
    { id: 'new', priority: 1, created_at: '2026-10-15T00:00:00Z' },
    { id: 'match', priority: 3, created_at: '2026-10-14T01:00:00Z' },
  ]
  it('未读优先，其次优先级，已读重要消息不会挡住新消息', () => {
    expect(orderRelevantNotices(notices).map((n) => n.id)).toEqual(['match', 'new', 'old'])
  })
  it('首次连接不补弹旧通知，刷新不重复弹，切换账号重新建立基线', () => {
    const initial = collectNewNotices(null, notices)
    expect(initial.fresh).toEqual([])
    const next = collectNewNotices(initial.seen, [...notices, { id: 'extra', created_at: '2026-10-15T02:00:00Z' }])
    expect(next.fresh.map((n) => n.id)).toEqual(['extra'])
    expect(collectNewNotices(next.seen, notices).fresh).toEqual([])
    expect(collectNewNotices(null, notices).fresh).toEqual([])
  })
  it('加载更多历史未读不会被当成实时新消息', () => {
    const initial = collectNewNotices(null, notices)
    const result = collectNewNotices(initial.seen, [...notices, { id: 'historical', created_at: '2026-09-01T00:00:00Z' }])
    expect(result.fresh).toEqual([])
  })
  it('延迟提交但晚于首次快照的新消息不会漏弹', () => {
    const initial = collectNewNotices(null, [{ id: 'first', created_at: '2026-10-15T04:00:00Z' }])
    const next = collectNewNotices(initial.seen, [{ id: 'later', created_at: '2026-10-15T04:00:02Z' }])
    const delayed = collectNewNotices(next.seen, [{ id: 'delayed', created_at: '2026-10-15T04:00:01Z' }])
    expect(delayed.fresh.map((n) => n.id)).toEqual(['delayed'])
  })
  it('保留数据库时间的微秒，不靠随机 ID 排除稍晚的新消息', () => {
    const initial = collectNewNotices(null, [{ id: 'z', created_at: '2026-10-15T04:00:00.123456Z' }])
    const result = collectNewNotices(initial.seen, [{ id: 'a', created_at: '2026-10-15T04:00:00.123789+00:00' }])
    expect(result.fresh.map((n) => n.id)).toEqual(['a'])
  })
})
