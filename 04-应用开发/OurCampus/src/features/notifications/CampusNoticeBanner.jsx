import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { createNoticeQueue, refreshNoticeQueue, dismissNotice, visibleNotice } from '../../data/noticeQueue.js'
import { campusDisplayText } from '../../data/campusPresentation.js'

export function CampusNoticeBanner({ userId, information, covered, onOpen }) {
  const [queue, setQueue] = useState(() => createNoticeQueue(userId))
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', changed)
    changed()
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  useEffect(() => {
    setQueue(previous => {
      const current = previous.ownerId === userId ? previous : createNoticeQueue(userId)
      if (!userId || information.ownerId !== userId || information.status !== 'ready') return current
      return refreshNoticeQueue(current, userId, information.notices)
    })
  }, [userId, information.ownerId, information.status, information.notices])
  const notice = visibleNotice(queue, userId, visible, covered)
  const noticeId = notice?.id
  useEffect(() => {
    if (!noticeId) return undefined
    // The countdown starts only while the banner is actually visible.
    const timer = setTimeout(() => setQueue(current => dismissNotice(current, userId, noticeId)), 10000)
    return () => clearTimeout(timer)
  }, [userId, noticeId])
  if (!notice) return null
  const dismiss = () => setQueue(current => dismissNotice(current, userId, notice.id))
  return <aside className="campus-notice-banner" aria-label="新的校园提醒">
    <button type="button" onClick={() => { onOpen(notice.id); dismiss() }}>
      <Bell size={21} /><span role="status"><strong>{campusDisplayText(notice.title)}</strong><small>{campusDisplayText(notice.reason || notice.body)}{queue.pending.length > 1 ? ` · 另有 ${queue.pending.length - 1} 条新提醒` : ''}</small></span>
    </button><button type="button" aria-label="暂时收起提醒" onClick={dismiss}><X size={18} /></button>
  </aside>
}
