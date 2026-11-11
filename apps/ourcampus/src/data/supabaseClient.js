import { createClient } from '@supabase/supabase-js'

export function normalizeSupabaseUrl(value) {
  const cleaned = String(value ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  if (!cleaned) return ''
  try {
    const url = new URL(cleaned)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') return ''
    return url.origin
  } catch {
    return ''
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
export const isSupabaseConfigured = Boolean(url && key.startsWith('sb_publishable_'))

async function fetchWithTimeout(input, options = {}) {
  const controller = new AbortController()
  const relayAbort = () => controller.abort()
  const timeout = setTimeout(relayAbort, 20000)
  options.signal?.addEventListener('abort', relayAbort, { once: true })
  if (options.signal?.aborted) relayAbort()
  try {
    return await fetch(input, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', relayAbort)
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchWithTimeout },
      realtime: { timeout: 15000 },
    })
  : null

export function describeServerError(error, fallback = '操作失败，请稍后重试') {
  const code = error?.code
  const message = String(error?.message ?? '')
  if (code === 'invalid_credentials') return '邮箱或密码不正确'
  if (code === 'email_not_confirmed') return '请先完成邮箱确认，再登录'
  if (code === 'user_already_exists') return '该邮箱已有账号，请直接登录'
  if (code === 'signup_disabled') return '服务器暂未开放注册，请联系项目管理员'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) return '请求过于频繁，请稍后重试；管理员可检查邮件发送额度'
  if (code === 'email_address_invalid' || code === 'email_address_not_authorized') return '邮箱无效或邮件服务尚未允许发送到该邮箱，请联系管理员'
  if (code === 'weak_password') return '密码不符合要求，请使用至少 8 位并包含字母和数字'
  if (code === 'same_password') return '新密码不能与旧密码相同'
  if (code === 'otp_expired') return '验证码无效或已过期，请重新获取'
  if (code === '42501') return '服务器权限配置不允许此操作，请联系项目管理员'
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202') return '服务器缺少账号或聊天表配置，请让队友检查建表 SQL'
  if (code === '23503') return '服务器缺少校园地区或账号资料，请联系项目管理员'
  if (code === '23514') return '提交内容不符合要求，请检查长度和输入内容'
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || error?.status === 401) return '登录已失效，请重新登录'
  if (/fetch|network|abort|timeout|Failed to load/i.test(message)) return '网络连接失败，请检查网络后重试'
  if (/sending confirmation|sending recovery|smtp/i.test(message)) return '服务器邮件发送失败，请让队友检查邮件服务配置'
  return fallback
}

export function requireSupabase() {
  if (!supabase) throw new Error('账号服务器尚未配置')
  return supabase
}
