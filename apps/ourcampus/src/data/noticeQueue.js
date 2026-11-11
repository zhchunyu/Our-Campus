import { collectNewNotices, orderRelevantNotices } from './notificationRelevance.js'

export const createNoticeQueue = (ownerId) => ({ ownerId, seen: null, pending: [] })

export function refreshNoticeQueue(previous, ownerId, notices = []) {
  const state = previous.ownerId === ownerId ? previous : createNoticeQueue(ownerId)
  if (!ownerId) return createNoticeQueue(ownerId)
  const owned = notices.filter(notice => !notice.recipient_id || notice.recipient_id === ownerId)
  const { seen, fresh } = collectNewNotices(state.seen, owned)
  const unread = new Map(owned.filter(notice => !notice.read_at).map(notice => [notice.id, notice]))
  const pending = new Map(state.pending.filter(notice => unread.has(notice.id)).map(notice => [notice.id, unread.get(notice.id)]))
  for (const notice of fresh) pending.set(notice.id, notice)
  return { ownerId, seen, pending: orderRelevantNotices([...pending.values()]) }
}

export function dismissNotice(state, ownerId, id) {
  return state.ownerId === ownerId ? { ...state, pending: state.pending.filter(notice => notice.id !== id) } : state
}

export function visibleNotice(state, ownerId, visible, covered) {
  return ownerId && state.ownerId === ownerId && visible && !covered ? state.pending[0] ?? null : null
}
