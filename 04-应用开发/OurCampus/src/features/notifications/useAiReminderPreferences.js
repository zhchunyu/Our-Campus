import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_AI_REMINDER_PREFERENCES, readAiReminderPreferences, saveAiReminderPreferences } from '../../data/aiReminderPreferences.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cancelled = () => Object.assign(new Error('账号已变化，请重新设置相关聊天提醒。'), { name: 'AbortError' })
export function useAiReminderPreferences(userId) {
  const [state, setState] = useState({ ownerId: null, status: 'idle', value: DEFAULT_AI_REMINDER_PREFERENCES, error: '' })
  const owner = useRef({ userId })
  if (owner.current.userId !== userId) owner.current = { userId }
  const actor = owner.current
  const mounted = useRef(false)
  const reads = useRef(0)
  const writes = useRef(Promise.resolve())
  const active = (actor) => mounted.current && owner.current === actor
  const refresh = useCallback(async () => {
    if (!UUID.test(userId ?? '') || actor.userId !== userId || !active(actor)) return
    const ticket = ++reads.current
    try {
      const value = await readAiReminderPreferences(userId)
      if (active(actor) && reads.current === ticket) setState({ ownerId: userId, status: 'ready', value, error: '' })
    } catch (error) {
      if (active(actor) && reads.current === ticket) setState((previous) => ({ ...previous, ownerId: userId,
        status: error.message?.includes('尚未升级') ? 'unavailable' : 'error',
        error: error.message || '相关聊天提醒设置读取失败，请重试。' }))
    }
  }, [userId, actor])
  useEffect(() => {
    mounted.current = true
    writes.current = Promise.resolve()
    setState({ ownerId: userId, status: UUID.test(userId ?? '') ? 'loading' : 'idle', value: DEFAULT_AI_REMINDER_PREFERENCES, error: '' })
    refresh()
    return () => { mounted.current = false; reads.current++ }
  }, [userId, refresh])
  const save = useCallback((patch) => {
    if (actor.userId !== userId || !active(actor)) return Promise.reject(cancelled())
    if (!UUID.test(userId ?? '')) return Promise.reject(new Error('请先登录后设置相关聊天提醒'))
    reads.current++
    const write = writes.current.catch(() => {}).then(async () => {
      if (!active(actor)) throw cancelled()
      const value = await saveAiReminderPreferences(userId, patch)
      if (!active(actor)) throw cancelled()
      reads.current++
      setState({ ownerId: userId, status: 'ready', value, error: '' })
    })
    writes.current = write
    return write
  }, [userId, actor])
  const visible = state.ownerId === userId ? state : { status: userId ? 'loading' : 'idle', value: DEFAULT_AI_REMINDER_PREFERENCES, error: '' }
  return { ...visible, refresh, save }
}
