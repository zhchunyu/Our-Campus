import { normalizePostImagePaths, safePostImagePaths } from './postImages.js'
import { CAMPUS_HALL_REGIONS } from './campusHall.js'
import { getAvatarUrl, listMemberProfiles } from './memberProfiles.js'
import { requireSupabase } from './supabaseClient.js'

const REGION_IDS = new Set(CAMPUS_HALL_REGIONS.filter((entry) => entry.id !== 'all').map((entry) => entry.id))
const MESSAGE_COLUMNS = 'id,author_id,region_id,content,client_message_id,deleted_at,created_at,image_paths'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const HALL_PAGE_SIZE = 50

export function createClientMessageId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function authorFields(profile) {
  const nickname = typeof profile === 'string' ? profile : profile?.nickname
  const avatarUrl = getAvatarUrl(profile?.avatar_path)
  return {
    author: typeof nickname === 'string' && nickname ? nickname : '校园同学',
    authorAvatarPath: avatarUrl ? profile.avatar_path : null,
    authorAvatarUrl: avatarUrl,
    authorProfileUpdatedAt: typeof profile?.updated_at === 'string' ? profile.updated_at : null,
  }
}

export function toHallMessage(row, nicknameOrProfile) {
  return {
    id: row.id, authorId: row.author_id, ...authorFields(nicknameOrProfile),
    regionId: row.region_id, content: row.content, createdAt: row.created_at, imagePaths: safePostImagePaths(row.image_paths),
    clientMessageId: row.client_message_id, deletedAt: row.deleted_at,
    time: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.created_at)),
  }
}

// Date.parse truncates submilliseconds. Compare the whole instant, retaining up to
// nanoseconds so Postgres microseconds and equivalent timezone offsets stay ordered.
function profileTimestamp(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return null
  const milliseconds = Date.parse(`${match[1]}${match[3]}`)
  if (!Number.isFinite(milliseconds)) return null
  return BigInt(milliseconds) * 1000000n + BigInt((match[2] ?? '').padEnd(9, '0'))
}

export function createHallProfileCache() {
  const profiles = new Map()
  let revision = 0
  let requestId = 0
  const beginRequest = () => ({ revision, id: ++requestId })
  const remember = (profile, request) => {
    if (typeof profile?.user_id !== 'string') return
    const current = profiles.get(profile.user_id)
    const timestamp = profileTimestamp(profile.updated_at)
    if (current) {
      if (request && current.deleted && request.revision < current.revision) return
      if (current.timestamp !== null && (timestamp === null || timestamp < current.timestamp)) return
      if (current.deleted && timestamp !== null && current.timestamp !== null && timestamp <= current.timestamp) return
      if (request && timestamp === current.timestamp && (request.revision < current.revision || request.id < current.requestId)) return
    }
    profiles.set(profile.user_id, { fields: authorFields(profile), timestamp, revision: ++revision, requestId: request?.id ?? requestId, deleted: false })
  }
  const deleteProfile = (userId, request) => {
    if (typeof userId !== 'string') return
    const current = profiles.get(userId)
    if (request && current && (request.revision < current.revision || request.id < current.requestId)) return
    profiles.set(userId, { fields: authorFields(null), timestamp: current?.timestamp ?? null, revision: ++revision, requestId: request?.id ?? requestId, deleted: true })
  }
  return {
    beginRequest,
    updateProfiles: (rows, request, requestedIds = []) => {
      const present = new Set(rows.map((profile) => profile.user_id))
      for (const profile of rows) remember(profile, request)
      for (const id of requestedIds) if (!present.has(id)) deleteProfile(id, request)
    },
    deleteProfile,
    absorbMessages: (messages, request) => {
      for (const message of messages) remember({ user_id: message.authorId, nickname: message.author, avatar_path: message.authorAvatarPath, updated_at: message.authorProfileUpdatedAt }, request)
    },
    apply: (messages) => messages.map((message) => {
      const profile = profiles.get(message.authorId)
      return profile ? { ...message, ...profile.fields } : message
    }),
  }
}

export function mergeHallMessages(existing, incoming, removedIds = new Set()) {
  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) {
    if (message.deletedAt || removedIds.has(message.id)) byId.delete(message.id)
    else byId.set(message.id, message)
  }
  for (const id of removedIds) byId.delete(id)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function hydrateHallMessages(rows) {
  if (!rows.length) return []
  const profiles = await listMemberProfiles(rows.map((row) => row.author_id))
  const byAuthor = new Map(profiles.map((profile) => [profile.user_id, profile]))
  return rows.map((row) => toHallMessage(row, byAuthor.get(row.author_id)))
}

export async function listHallMessages({ regionId = 'all', before = null }) {
  if (regionId !== 'all' && !REGION_IDS.has(regionId)) throw new Error('请选择有效的校园地区')
  let query = requireSupabase().from('hall_messages').select(MESSAGE_COLUMNS)
    .is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(HALL_PAGE_SIZE)
  if (regionId !== 'all') query = query.eq('region_id', regionId)
  if (before) {
    if (!UUID_PATTERN.test(before.id) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before.createdAt) || !Number.isFinite(Date.parse(before.createdAt))) throw new Error('历史消息游标无效')
    // Preserve Postgres microseconds; Date.toISOString() would skip messages within the same millisecond.
    const time = before.createdAt
    query = query.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${before.id})`)
  }
  const { data, error } = await query
  if (error) throw error
  const oldest = data.at(-1)
  return {
    messages: await hydrateHallMessages(data),
    before: oldest ? { id: oldest.id, createdAt: oldest.created_at } : before,
    hasMore: data.length === HALL_PAGE_SIZE,
  }
}

export async function sendHallMessage({ content, regionId, clientMessageId, authorId, imagePaths = [] }) {
  const text = String(content ?? '').trim()
  const paths = normalizePostImagePaths(imagePaths, authorId)
  if ((!text && !paths.length) || [...text].length > 200) throw new Error('请输入消息或添加照片，文字最多 200 个字')
  if (!REGION_IDS.has(regionId)) throw new Error('请选择消息所属地区')
  if (!UUID_PATTERN.test(clientMessageId) || !UUID_PATTERN.test(authorId)) throw new Error('登录状态或消息标识无效，请重新登录')
  const client = requireSupabase()
  const { data, error } = await client.from('hall_messages').insert({
    region_id: regionId, content: text, client_message_id: clientMessageId, image_paths: paths,
  }).select(MESSAGE_COLUMNS).single()
  if (error?.code === '23505') {
    const previous = await client.from('hall_messages').select(MESSAGE_COLUMNS)
      .eq('author_id', authorId).eq('client_message_id', clientMessageId).single()
    if (previous.error) throw previous.error
    if (previous.data.content !== text || previous.data.region_id !== regionId || JSON.stringify(safePostImagePaths(previous.data.image_paths)) !== JSON.stringify(paths)) throw new Error('消息内容已变化，请重新发送')
    return (await hydrateHallMessages([previous.data]))[0]
  }
  if (error) throw error
  return (await hydrateHallMessages([data]))[0]
}

export async function retractHallMessage(id, authorId) {
  const { data, error } = await requireSupabase().from('hall_messages').update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('author_id', authorId).is('deleted_at', null).select('id').single()
  if (error) throw error
  return data
}
