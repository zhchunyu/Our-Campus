import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabaseClient.js'
import { listActiveInformationEvents, informationError } from '../../data/campusInformation.js'

const EMPTY = { ownerId: null, notices: [], reports: [], subscriptions: [], events: [], unread: 0, status: 'idle', error: '', more: false }
export function useCampusInformation(userId) {
  const [state, setState] = useState(EMPTY)
  const currentUser = useRef(userId)
  currentUser.current = userId
  const loading = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    if (!supabase || !userId || loading.current) return
    loading.current = true
    const ticket = generation.current
    try {
      const result = await Promise.all([
        supabase.from('notifications').select('*').eq('recipient_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
        supabase.from('campus_reports').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('campus_subscriptions').select('*').eq('user_id', userId),
        listActiveInformationEvents().then((data) => ({ data })),
      ])
      const failed = result.find((r) => r.error)
      if (failed) throw failed.error
      if (currentUser.current !== userId || ticket !== generation.current) return
      setState({ ownerId: userId, notices: result[0].data, unread: result[1].count ?? 0, reports: result[2].data,
        subscriptions: result[3].data, events: result[4].data, status: 'ready', error: '', more: result[0].data.length === 50 })
    } catch (error) {
      if (currentUser.current === userId && ticket === generation.current) setState((s) => ({ ...s, status: 'error', error: informationError(error) }))
    } finally { if (ticket === generation.current) loading.current = false }
  }, [userId])
  useEffect(() => {
    generation.current++; loading.current = false
    setState({ ...EMPTY, ownerId: userId, status: userId ? 'loading' : 'idle' })
    if (!supabase || !userId) return undefined
    let live = true; let debounce
    const changed = () => { clearTimeout(debounce); debounce = setTimeout(() => { if (live) refresh() }, 250) }
    const channel = supabase.channel(`campus-information:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campus_reports' }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campus_events' }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campus_subscriptions', filter: `user_id=eq.${userId}` }, changed)
      .subscribe((status) => { if (status === 'SUBSCRIBED') changed() })
    refresh()
    const timer = setInterval(changed, 30000)
    const resumed = () => { if (document.visibilityState === 'visible') changed() }
    window.addEventListener('online', changed); document.addEventListener('visibilitychange', resumed)
    return () => { live = false; generation.current++; loading.current = false; clearTimeout(debounce); clearInterval(timer); supabase.removeChannel(channel); window.removeEventListener('online', changed); document.removeEventListener('visibilitychange', resumed) }
  }, [userId, refresh])
  const markRead = useCallback(async (id) => {
    if (!userId) return
    const query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', userId).is('read_at', null)
    const { error } = await (id ? query.eq('id', id) : query)
    if (error) throw error
    await refresh()
  }, [userId, refresh])
  const loadMore = useCallback(async () => {
    const last = state.notices.at(-1)
    if (!userId || !last || !state.more) return
    const { data, error } = await supabase.from('notifications').select('*').eq('recipient_id', userId)
      .or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
    if (error) throw error
    if (currentUser.current === userId) setState((s) => ({ ...s, notices: [...s.notices, ...data.filter((n) => !s.notices.some((old) => old.id === n.id))], more: data.length === 50 }))
  }, [userId, state.notices, state.more])
  const visible = state.ownerId === userId ? state : { ...EMPTY, status: userId ? 'loading' : 'idle' }
  return { ...visible, refresh, markRead, loadMore }
}
