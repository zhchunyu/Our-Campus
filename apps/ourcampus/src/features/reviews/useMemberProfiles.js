import { useEffect, useRef, useState } from 'react'
import { isMemberUserId } from '../../data/memberHallMessages.js'
import { listMemberProfiles } from '../../data/memberProfiles.js'
import { describeServerError, supabase } from '../../data/supabaseClient.js'

export function useMemberProfiles({ userIds = [], viewerId }) {
  const idsKey = [...new Set(userIds.filter(isMemberUserId))].sort().join(',')
  const viewer = isMemberUserId(viewerId) ? viewerId : 'guest'
  const identity = `${viewer}:${idsKey}`
  const [state, setState] = useState({ identity, viewer, profiles: {}, error: '' })
  const connectionRef = useRef(null)
  const identityRef = useRef(identity)
  identityRef.current = identity

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    setState((current) => ({
      identity, viewer, error: '',
      profiles: viewer !== 'guest' && current.viewer === viewer ? Object.fromEntries(ids.filter((id) => current.profiles[id]).map((id) => [id, current.profiles[id]])) : {},
    }))
    if (viewer === 'guest' || !ids.length) {
      connectionRef.current = null
      return undefined
    }
    let disposed = false
    let requestId = 0
    const update = (changes) => {
      if (!disposed && identityRef.current === identity) setState((current) => current.identity === identity ? { ...current, ...changes } : current)
    }
    const refresh = async () => {
      if (disposed || identityRef.current !== identity) return
      const request = ++requestId
      try {
        const rows = await listMemberProfiles(ids)
        if (disposed || identityRef.current !== identity || request !== requestId) return
        update({ profiles: Object.fromEntries(rows.filter((row) => ids.includes(row.user_id)).map((row) => [row.user_id, row])), error: '' })
      } catch (error) {
        if (!disposed && identityRef.current === identity && request === requestId) update({ error: describeServerError(error, '评价作者资料同步失败，请重试') })
      }
    }
    connectionRef.current = { identity, refresh }
    const handleChange = (payload) => {
      const changedId = payload.new?.user_id ?? payload.old?.user_id
      if (!changedId || ids.includes(changedId)) void refresh()
    }
    // Read after subscribing, then reconcile on reconnect and when returning to
    // the app. Polling also repairs profile events missed by this device.
    const channel = ids.length ? supabase?.channel(`review-member-profiles:${viewer}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handleChange)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh() }) : null
    void refresh()
    const resumed = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', resumed)
    const timer = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void refresh() }, 30000)
    return () => {
      disposed = true
      requestId += 1
      clearInterval(timer)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', resumed)
      if (channel) void supabase.removeChannel(channel)
      if (connectionRef.current?.identity === identity) connectionRef.current = null
    }
  }, [identity, idsKey, viewer])

  const profiles = viewer !== 'guest' && state.viewer === viewer ? Object.fromEntries((idsKey ? idsKey.split(',') : []).filter((id) => state.profiles[id]).map((id) => [id, state.profiles[id]])) : {}
  return {
    profiles,
    error: viewer !== 'guest' && state.identity === identity ? state.error : '',
    refresh: () => connectionRef.current?.identity === identity ? connectionRef.current.refresh() : Promise.resolve(),
  }
}
