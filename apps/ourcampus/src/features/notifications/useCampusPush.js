import { useCallback, useEffect, useRef, useState } from 'react'
import { CampusPush, canRegisterPushDevice, disablePushDevice, isAndroidPush, pushStatus, registerPushDevice } from '../../data/campusPush.js'
import { informationError } from '../../data/campusInformation.js'

const initialStatus = { configured: false, enabled: false, permission: 'unknown' }

export function useCampusPush(userId, onOpenNotice, authReady) {
  const [snapshot, setSnapshot] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const signedOut = authReady && !userId
  const ownerRef = useRef({ userId, signedOut, needsDisable: signedOut })
  if (ownerRef.current.userId !== userId || ownerRef.current.signedOut !== signedOut) {
    // Wait for the first session to load before clearing an existing device opt-in.
    ownerRef.current = { userId, signedOut, needsDisable: Boolean(signedOut || ownerRef.current.userId || ownerRef.current.needsDisable) }
  }
  const queue = useRef(Promise.resolve())
  const openRef = useRef(onOpenNotice); openRef.current = onOpenNotice

  // Finish earlier registration writes before disabling the device or logging out.
  const enqueue = useCallback((work) => {
    const next = queue.current.then(work)
    queue.current = next.catch(() => {})
    return next
  }, [])

  const syncDevice = useCallback((owner, readStatus) => enqueue(async () => {
    if (ownerRef.current !== owner) return
    const publish = (status, registration = 'idle', error = '') => {
      if (ownerRef.current === owner) setSnapshot({ owner, status, registration, error })
    }
    let current
    try {
      if (owner.needsDisable) {
        if (isAndroidPush() && (await pushStatus()).enabled) await CampusPush.disable()
        owner.needsDisable = false
        if (ownerRef.current !== owner) return
      }
      current = await readStatus()
      if (ownerRef.current !== owner) return
      if (!owner.userId || !canRegisterPushDevice(current)) {
        publish(current)
        return
      }

      publish(current, 'registering')
      const confirmed = await registerPushDevice(current, owner.userId)
      if (ownerRef.current !== owner) return
      const latest = await pushStatus()
      if (!canRegisterPushDevice(latest) || latest.cid !== current.cid || latest.installationId !== current.installationId) {
        publish(latest)
        return
      }
      publish(latest, confirmed ? 'registered' : 'failed')
    } catch (error) {
      publish(current ?? initialStatus, current ? 'failed' : 'idle', informationError(error))
    }
  }), [enqueue])

  const refresh = useCallback(() => {
    const owner = ownerRef.current
    setSnapshot((current) => current?.owner === owner && current.registration === 'registered'
      ? { ...current, registration: 'idle' }
      : current)
    return syncDevice(owner, pushStatus)
  }, [syncDevice])
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
    const resume = () => { if (document.visibilityState === 'visible') { refresh(); if (isAndroidPush()) readPending().catch(() => {}) } }
    document.addEventListener('visibilitychange', resume)
    return () => { alive = false; deviceListener?.remove(); clickListener?.remove(); document.removeEventListener('visibilitychange', resume) }
  }, [refresh])
  useEffect(() => { refresh() }, [userId, signedOut, refresh])

  const runAction = async (type, work) => {
    const action = { type, owner: ownerRef.current }
    setPendingAction(action)
    try { await work(action.owner) }
    finally { setPendingAction((current) => current === action ? null : current) }
  }

  const enable = () => runAction('enable', (owner) => syncDevice(owner, () => {
    if (!owner.userId) throw new Error('请先登录，再开启校园通知')
    return CampusPush.enable({ consent: true })
  }))

  const disable = () => runAction('disable', (owner) => enqueue(async () => {
    if (ownerRef.current !== owner) throw new Error('账号已变化，请重试。')
    try { await disablePushDevice(owner.userId) }
    finally {
      const status = await pushStatus().catch(() => initialStatus)
      if (ownerRef.current === owner) setSnapshot({ owner, status, registration: 'idle', error: '' })
    }
  }))

  const current = snapshot?.owner === ownerRef.current ? snapshot : null
  const action = pendingAction?.owner === ownerRef.current ? pendingAction.type : null
  return {
    status: current?.status ?? initialStatus,
    registration: action === 'disable' ? 'idle' : current?.registration ?? 'idle',
    error: current?.error ?? '',
    busy: Boolean(action),
    action,
    enable,
    disable,
    refresh,
  }
}
