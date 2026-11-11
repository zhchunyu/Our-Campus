import { requireSupabase } from './supabaseClient.js'

export const DEFAULT_AI_REMINDER_PREFERENCES = Object.freeze({ enabled: false, use_favorites: true, match_lost: true, interest_keywords: Object.freeze([]) })
const TABLE = 'campus_ai_reminder_preferences'
const COLUMNS = 'user_id,enabled,use_favorites,match_lost,interest_keywords,created_at,updated_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fields = new Set(['enabled', 'use_favorites', 'match_lost', 'interest_keywords'])
const interestError = '请填写最多 8 个兴趣词，每个 2–16 字。'
const unavailable = (error) => ['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error?.code)
function checkedUser(userId) {
  if (!UUID.test(userId ?? '')) throw new Error('请先登录后设置相关聊天提醒')
}
function checkedKeywords(values) {
  if (!Array.isArray(values) || values.some((word) => typeof word !== 'string')) throw new Error(interestError)
  const words = [...new Set(values.map((word) => word.trim()).filter(Boolean))]
  if (words.length > 8 || words.some((word) => [...word].length < 2 || [...word].length > 16)
    || new TextEncoder().encode(words.join('')).byteLength > 512) throw new Error(interestError)
  return words
}
export function parseAiReminderInterestKeywords(input) {
  if (typeof input !== 'string') throw new Error(interestError)
  return checkedKeywords(input.split(/[、,，;；\n]/))
}
function checkedPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length
    || Object.keys(patch).some((field) => !fields.has(field))) throw new Error('相关聊天提醒设置无效')
  const value = { ...patch }
  for (const field of ['enabled', 'use_favorites', 'match_lost']) {
    if (field in value && typeof value[field] !== 'boolean') throw new Error('相关聊天提醒开关无效')
  }
  if ('interest_keywords' in value) value.interest_keywords = checkedKeywords(value.interest_keywords)
  return value
}
function failure(error) {
  return new Error(unavailable(error) ? '相关聊天提醒服务尚未升级，请稍后再试。' : '相关聊天提醒设置同步失败，请稍后重试。')
}
function preferences(row, userId) {
  if (!row) return { ...DEFAULT_AI_REMINDER_PREFERENCES, interest_keywords: [] }
  if (row.user_id !== userId || ['enabled', 'use_favorites', 'match_lost'].some((field) => typeof row[field] !== 'boolean')) {
    throw new Error('相关聊天提醒设置读取失败，请重试。')
  }
  return { enabled: row.enabled, use_favorites: row.use_favorites, match_lost: row.match_lost,
    interest_keywords: checkedKeywords(row.interest_keywords) }
}
export async function readAiReminderPreferences(userId, client = requireSupabase()) {
  checkedUser(userId)
  const { data, error } = await client.from(TABLE).select(COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw failure(error)
  return preferences(data, userId)
}
export async function saveAiReminderPreferences(userId, patch, client = requireSupabase()) {
  checkedUser(userId)
  const value = checkedPatch(patch)
  const update = () => client.from(TABLE).update(value).eq('user_id', userId).select(COLUMNS).maybeSingle()
  let result = await update()
  if (result.error) throw failure(result.error)
  if (!result.data) {
    result = await client.from(TABLE).insert({ user_id: userId, ...DEFAULT_AI_REMINDER_PREFERENCES, ...value }).select(COLUMNS).maybeSingle()
    if (result.error?.code === '23505') result = await update()
  }
  if (result.error) throw failure(result.error)
  if (!result.data) throw new Error('相关聊天提醒设置未保存，请重试。')
  return preferences(result.data, userId)
}
