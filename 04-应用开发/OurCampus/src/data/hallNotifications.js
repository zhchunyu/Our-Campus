import { CAMPUS_HALL_REGIONS } from './campusHall.js'
import { requireSupabase } from './supabaseClient.js'

export const HALL_NOTIFICATION_KIND = 'hall-message'
export const HALL_NOTIFICATION_REGIONS = CAMPUS_HALL_REGIONS.filter((region) => region.id !== 'all')
const REGION_IDS = new Set(HALL_NOTIFICATION_REGIONS.map((region) => region.id))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIX = 'hall-region:'

export function hallSubscriptionScope(regionId) {
  if (!REGION_IDS.has(regionId)) throw new Error('请选择一个聊天地区')
  return PREFIX + regionId
}
export function isHallSubscription(subscription) {
  return subscription?.kind === HALL_NOTIFICATION_KIND && subscription.location_id?.startsWith(PREFIX)
    && REGION_IDS.has(subscription.location_id.slice(PREFIX.length))
}
export async function setHallNotificationSubscription({ userId, regionId, enabled }, client = requireSupabase()) {
  if (!UUID.test(userId ?? '')) throw new Error('请先登录后设置聊天提醒')
  const scope = hallSubscriptionScope(regionId)
  const table = client.from('campus_subscriptions')
  const { error } = enabled
    ? await table.insert({ location_id: scope, kind: HALL_NOTIFICATION_KIND })
    : await table.delete().eq('user_id', userId).eq('location_id', scope).eq('kind', HALL_NOTIFICATION_KIND)
  if (enabled && error?.code === '23505') return
  if (['23514', '42P01', '42703', 'PGRST205'].includes(error?.code)) throw new Error('聊天提醒服务尚未升级，请稍后再试。')
  if (error) throw error
}
export function hallNotificationRegion(notice, message) {
  if (!['hall-message', 'hall-reply'].includes(notice?.type) || notice?.related_type !== 'message'
    || message?.id !== notice.related_id || message.deleted_at || !REGION_IDS.has(message.region_id)) return null
  return message.region_id
}
export async function getHallNotificationMessage(notice, client = requireSupabase()) {
  if (notice?.related_type !== 'message' || !['hall-message', 'hall-reply'].includes(notice.type)
    || !UUID.test(notice.related_id ?? '')) return null
  const { data, error } = await client.from('hall_messages')
    .select('id,region_id,content,image_paths,deleted_at,created_at').eq('id', notice.related_id).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return hallNotificationRegion(notice, data) ? data : null
}

// A detail may refer to a notification older than the currently loaded page.
// Revalidate its own row and source instead of treating absence from that page as deletion.
export async function getCurrentHallNotificationDetail(notice, userId, client = requireSupabase()) {
  if (!UUID.test(userId ?? '') || notice?.recipient_id !== userId || !UUID.test(notice?.id ?? '')
    || notice.related_type !== 'message') return null
  const { data, error } = await client.from('notifications').select('*')
    .eq('id', notice.id).eq('recipient_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const target = await getHallNotificationMessage(data, client)
  return target ? { notice: data, target } : null
}
