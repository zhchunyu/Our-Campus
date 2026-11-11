import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabaseClient.js'

export const DEFAULT_NOTIFICATION_PREFERENCES = { favorite_location_ids: [], interest_keywords: [], favorite_priority: true, match_alerts: true }
const unavailable = (e) => ['42P01', 'PGRST202', 'PGRST205', '42703'].includes(e?.code)

export function useNotificationPreferences(userId) {
  const [state, setState] = useState({ ownerId: null, status: 'idle', value: DEFAULT_NOTIFICATION_PREFERENCES, error: '' })
  const actor = useRef(userId); actor.current = userId
  const revision = useRef(0)
  const writes = useRef(Promise.resolve())
  const readRevision = useRef(0)
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return
    const ticket = revision.current; const read = ++readRevision.current
    const { data, error } = await supabase.from('campus_notification_preferences').select('*').eq('user_id', userId).maybeSingle()
    if (ticket !== revision.current || read !== readRevision.current || actor.current !== userId) return
    setState({ ownerId: userId, status: error ? unavailable(error) ? 'unavailable' : 'error' : 'ready',
      value: data ?? DEFAULT_NOTIFICATION_PREFERENCES,
      error: error ? unavailable(error) ? '个性化提醒服务尚未升级，原有校园消息仍可使用。' : '暂时无法读取通知偏好，请稍后重试。' : '' })
  }, [userId])
  useEffect(() => {
    revision.current++
    setState({ ownerId: userId, status: userId ? 'loading' : 'idle', value: DEFAULT_NOTIFICATION_PREFERENCES, error: '' })
    refresh()
    return () => { revision.current++ }
  }, [userId, refresh])
  const save = useCallback((patch) => {
    const current = userId; const ticket = revision.current
    const write = writes.current.catch(() => {}).then(async () => {
      if (!supabase || !current) throw new Error('请先登录')
      if (actor.current !== current || ticket !== revision.current) return
      const { data, error } = await supabase.rpc('campus_save_notification_preferences', { p_preferences: patch })
      if (actor.current !== current || ticket !== revision.current) return
      if (error) throw new Error(unavailable(error) ? '个性化提醒服务尚未升级，原有校园消息仍可使用。' : '通知偏好保存失败，请稍后重试。')
      readRevision.current++
      setState({ ownerId: current, status: 'ready', value: data, error: '' })
    })
    writes.current = write
    return write
  }, [userId])
  // 仅同步用户本次主动收藏/取消的地点，不用设备旧列表覆盖账号云端偏好。
  const setFavorite = async (id, enabled) => {
    try { await save({ [enabled ? 'add_favorite_location_ids' : 'remove_favorite_location_ids']: [id] }) }
    catch (error) {
      if (actor.current === userId) setState((s) => ({ ...s, error: error.message }))
      throw error
    }
  }
  const visible = state.ownerId === userId ? state : { status: userId ? 'loading' : 'idle', value: DEFAULT_NOTIFICATION_PREFERENCES, error: '' }
  return { ...visible, save, setFavorite, refresh }
}
