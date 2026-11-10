import { normalizeSupabaseUrl, requireSupabase } from './supabaseClient.js'

function gatewayUrl() {
  if (import.meta.env.DEV) return '/api/auv-assistant'
  const configured = String(import.meta.env.VITE_AUV_GATEWAY_URL ?? '').trim()
  if (configured) {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('AI 网关地址配置不正确，请联系管理员。')
    return url.href
  }
  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
  if (!url) throw new Error('AI 网关尚未配置，请联系管理员。')
  return `${url}/functions/v1/auv-assistant`
}

export async function requestAuv({ text, mode, locationId, history, context, expectedUserId }, signal) {
  const auth = requireSupabase().auth
  const { data, error } = await auth.getSession()
  if (error || !data.session?.access_token || !data.session.user?.id) throw new Error('请先登录，再使用校园助手。')
  const actor = expectedUserId ?? data.session.user.id
  const sameActor = (session) => {
    if (!session?.access_token) throw new Error('登录已失效，请重新登录。')
    if (session.user?.id !== actor) throw new Error('账号已变化，请重新发送。')
    return session
  }
  const initialSession = sameActor(data.session)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, 65000)
  const active = () => { if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError') }
  const body = JSON.stringify({ text, mode, locationId: locationId || null, history, context })
  const post = (session) => {
    active()
    return fetch(gatewayUrl(), {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '') },
      body,
    })
  }
  try {
    let response = await post(initialSession)
    // A gateway 401 precedes model processing. Never retry network or provider errors.
    if (response.status === 401) {
      active()
      const before = await auth.getSession()
      if (before.error) throw new Error('登录已失效，请重新登录。')
      sameActor(before.data?.session)
      active()
      let refreshed
      try { refreshed = await auth.refreshSession() } catch { throw new Error('登录已失效，请重新登录。') }
      if (refreshed.error) throw new Error('登录已失效，请重新登录。')
      const refreshedSession = sameActor(refreshed.data?.session)
      active()
      const after = await auth.getSession()
      if (after.error) throw new Error('登录已失效，请重新登录。')
      sameActor(after.data?.session)
      response = await post(refreshedSession)
    }
    let result
    try { result = await response.json() } catch { throw new Error('AI 网关尚未就绪，请联系管理员检查部署。') }
    if (!response.ok) throw new Error(result.error?.message || (response.status === 401 ? '登录已失效，请重新登录。' : response.status === 404 ? 'AI 网关尚未部署，请联系管理员。' : 'AI 请求失败，请稍后重试。'))
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('AI 返回内容为空，请重试。')
    return result
  } catch (failure) {
    if (signal?.aborted) throw failure
    if (controller.signal.aborted) throw new Error('AI 回复等待超时，内容已保留，可以稍后再试。')
    if (failure instanceof TypeError) throw new Error('暂时连不上 AI 服务，请检查网络后重试。')
    throw failure
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}
