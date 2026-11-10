import { safePostImagePaths } from './postImages.js'
import { requireSupabase } from './supabaseClient.js'

const PUBLIC_MESSAGE_COLUMNS = 'id,author_id,content,region_id,created_at,deleted_at,image_paths'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MEMBER_HALL_MESSAGE_LIMIT = 20

export function isMemberUserId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function toMemberHallMessage(row, userId) {
  if (!row || !isMemberUserId(row.id) || row.author_id !== userId || row.deleted_at || typeof row.content !== 'string' || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return null
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    regionId: row.region_id,
    createdAt: row.created_at,
    deletedAt: null,
    imagePaths: safePostImagePaths(row.image_paths),
  }
}

export async function listMemberHallMessages(userId) {
  if (!isMemberUserId(userId)) throw new Error('成员标识无效')
  const { data, error } = await requireSupabase().from('hall_messages').select(PUBLIC_MESSAGE_COLUMNS)
    .eq('author_id', userId).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MEMBER_HALL_MESSAGE_LIMIT)
  if (error) throw error
  return (data ?? []).map((row) => toMemberHallMessage(row, userId)).filter(Boolean).slice(0, MEMBER_HALL_MESSAGE_LIMIT)
}
