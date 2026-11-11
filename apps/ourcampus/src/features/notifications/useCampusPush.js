import { useCallback, useEffect, useRef, useState } from 'react'
import { CampusPush, isAndroidPush, pushStatus, registerPushDevice } from '../../data/campusPush.js'
import { informationError } from '../../data/campusInformation.js'

export function useCampusPush(userId, onOpenNotice) {
  const [status, setStatus] = useState({ configured: false, enabled: false, permission: 'unknown' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const userRef = useRef(userId); userRef.current = userId
  const openRef = useRef(onOpenNotice); openRef.current = onOpenNotice
  const refresh = useCallback(async () => {
    try {
      const current = await pushStatus()
      setStatus(current)
      if (userRef.current && current.enabled && current.cid) await registerPushDevice(current)
    } catch (e) { setError(informationError(e)) }
  }, [])
  useEffect(() => {
    let alive = true; let deviceListener; let clickListener
    const readPending = async () => {
      const pending = await CampusPush.consumePendingNotice()
      if (alive && pending.id) openRef.current(pending.id)
    }
    if (isAndroidPush()) {
      CampusPush.addListener('registration', () => { if (alive) refresh() }).then((h) => { if (alive) deviceListener = h; else h.remove() })
      CampusPush.addListener('noticeOpened', ({ id }) => { if (alive) openRef.current(id) }).then((h) => { if (alive) clickListener = h; else h.remove() })
      readPending().catch(() => {})
    }
    refresh()
    const resume = () => { if (document.visibilityState === 'visible') { refresh(); if (isAndroidPush()) readPending().catch(() => {}) } }
    document.addEventListener('visibilitychange', resume)
    return () => { alive = false; deviceListener?.remove(); clickListener?.remove(); document.removeEventListener('visibilitychange', resume) }
  }, [refresh])
  useEffect(() => { if (userId) refresh() }, [userId, refresh])
  const enable = async () => {
    if (!userId) throw new Error('请先登录，再开启校园通知')
    setBusy(true); setError('')
    try {
      const result = await CampusPush.enable({ consent: true })
      setStatus(result)
      if (result.permission !== 'granted') throw new Error('通知权限尚未开启，可到系统设置允许 OurCampus 通知')
      await registerPushDevice(result)
    } catch (e) { setError(informationError(e)) }
    finally { setBusy(false) }
  }
  return { status, error, busy, enable, refresh }
}
