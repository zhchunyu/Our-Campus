import { requireSupabase, supabase } from './supabaseClient.js'

export const PROFILE_COLUMNS = 'user_id,nickname,avatar_path,updated_at'
const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const OWNER_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const AVATAR_PATH_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:jpg|jpeg|png|webp)$/i
const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,((?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?)$/i

function basicProfile(row) {
  if (!row || typeof row.user_id !== 'string') return null
  return {
    user_id: row.user_id,
    nickname: typeof row.nickname === 'string' ? row.nickname : '',
    avatar_path: typeof row.avatar_path === 'string' && AVATAR_PATH_PATTERN.test(row.avatar_path) ? row.avatar_path : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

export function getAvatarUrl(path) {
  if (typeof path !== 'string' || !AVATAR_PATH_PATTERN.test(path) || !supabase) return ''
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data?.publicUrl ?? ''
}

export async function listMemberProfiles(userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter((id) => typeof id === 'string' && OWNER_PATTERN.test(id)))]
  if (!ids.length) return []
  const client = requireSupabase()
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).in('user_id', batch)
    if (error) throw error
    rows.push(...(data ?? []).filter((row) => batch.includes(row.user_id)).map(basicProfile).filter(Boolean))
  }
  return rows
}

export async function getMemberProfile(userId) {
  if (typeof userId !== 'string' || !OWNER_PATTERN.test(userId)) return null
  const { data, error } = await requireSupabase().from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.user_id === userId ? basicProfile(data) : null
}

function assertCurrent(isCurrent) {
  if (isCurrent()) return
  const error = new Error('账号状态已变化，请重新操作')
  error.name = 'AbortError'
  throw error
}

function avatarImage(image) {
  if (typeof image !== 'string' || image.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 40) throw new Error('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片')
  const match = IMAGE_PATTERN.exec(image)
  if (!match || !match[2]) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0
  if (match[2].length / 4 * 3 - padding > MAX_AVATAR_BYTES) throw new Error('头像不能超过 5 MB')
  let bytes
  try { bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)) } catch { throw new Error('图片无法读取，请换一张图片') }
  const type = match[1].toLowerCase()
  return { blob: new Blob([bytes], { type: `image/${type}` }), extension: type === 'jpeg' ? 'jpg' : type }
}

export async function saveProfileAvatar({ userId, image, isCurrent = () => true }) {
  if (typeof userId !== 'string' || !OWNER_PATTERN.test(userId)) throw new Error('请先登录后同步头像')
  const client = requireSupabase()
  assertCurrent(isCurrent)
  let path = null
  if (image !== '') {
    const { blob, extension } = avatarImage(image)
    path = `${userId}/${crypto.randomUUID()}.${extension}`
    assertCurrent(isCurrent)
    const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
  }
  assertCurrent(isCurrent)
  const { data, error } = await client.from('profiles').update({ avatar_path: path }).eq('user_id', userId).select(PROFILE_COLUMNS).single()
  assertCurrent(isCurrent)
  if (error) throw error
  const profile = data?.user_id === userId ? basicProfile(data) : null
  if (!profile || profile.avatar_path !== path) throw new Error('头像资料未能保存，请重试')
  // Never delete here: a lost response may hide a committed profile reference.
  // Old objects also remain valid while other clients still display their URL.
  return profile
}
