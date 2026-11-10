import { normalizePostImagePaths, safePostImagePaths } from './postImages.js'
import { requireSupabase } from './supabaseClient.js'

export const INFORMATION_KINDS = { activity: '校园活动', construction: '施工', closure: '封路 / 关闭', 'water-power': '停水停电', crowd: '排队 / 拥挤', notice: '校园通知', lost: '寻物', found: '招领', repair: '设施报修', feedback: '地点反馈' }
export const PUBLIC_INFORMATION_KINDS = new Set(['construction', 'closure', 'water-power'])
export const REPORT_STATUS = { submitted: '待分析', analyzed: '分析完成 · 待确认', published: '已审核发布', resolved: '已完成', withdrawn: '已撤回', rejected: '未通过审核' }
export const newReportId = () => crypto.randomUUID()
export function informationError(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(error?.code)) return '校园信息服务尚未部署，请让服务器同学执行 09 号增量 SQL。原有登录和聊天仍可使用。'
  if (error?.code === '42501') return '当前账号没有这项操作权限，请检查登录或联系管理员。'
  return error?.message?.includes('fetch') ? '网络连接失败，内容已保留，请重试。' : error?.message || '操作未完成，请重试。'
}
export async function submitCampusReport(input) {
  const client = requireSupabase()
  if (!INFORMATION_KINDS[input.kind] || !input.title?.trim() || !input.body?.trim()) throw new Error('请填写信息类型、标题和说明')
  const { data, error } = await client.rpc('campus_submit_report', {
    p_client_id: input.clientId, p_kind: input.kind, p_title: input.title.trim(), p_body: input.body.trim(),
    p_location_id: input.locationId || null, p_details: input.details ?? {}, p_source_message_id: input.sourceMessageId ?? null,
  })
  if (error) throw error
  return data
}
export async function setReportStatus(id, status) {
  const { error } = await requireSupabase().rpc('campus_set_report_status', { p_id: id, p_status: status })
  if (error) throw error
}
export async function reviewCampusReport(input) {
  const { data, error } = await requireSupabase().rpc('campus_review_report', {
    p_id: input.id, p_publish: input.publish, p_title: input.title ?? '', p_summary: input.summary ?? '',
    p_location_id: input.locationId || null, p_kind: input.kind ?? 'notice',
    p_end_at: input.endAt || null, p_scope: input.scope ?? 'subscribers', p_event_id: input.eventId || null,
  })
  if (error) throw error
  return data
}
export async function retryCampusReport(id) {
  const { error } = await requireSupabase().rpc('campus_retry_information_report', { p_id: id })
  if (error) throw error
}
export function cloudEventRecord(row) {
  return { id: row.id, locationId: row.location_id, type: row.type, title: row.title, impact: row.impact,
    startAt: row.start_at, endAt: row.end_at, status: row.status, heatLevel: row.heat_level,
    affectedEdgeIds: row.affected_edge_ids ?? [], visibleTo: row.visible_to, isCloud: true, isDemo: row.is_demo,
    informationKind: row.information_kind, informationScope: row.information_scope }
}

export function eventReportImagePaths(reports, eventId) {
  return [...new Set((reports ?? []).filter((report) => report.status === 'published' && report.event_id === eventId).flatMap((report) => safePostImagePaths(report.details?.image_paths)))].slice(0, 3)
}

export function reportImageDetails(details = {}, uploaded = [], ownerId) {
  const paths = normalizePostImagePaths([...(details.image_paths ?? []), ...uploaded], ownerId)
  return paths.length ? { ...details, image_paths: paths } : { ...details }
}

// Embed reviewed source reports per event, independently of the recent report feed.
export async function listActiveInformationEvents() {
  const { data, error } = await requireSupabase().from('campus_events')
    .select('*,image_reports:campus_reports!campus_reports_event_id_fkey(event_id,status,details)')
    .eq('source', 'community-reviewed').eq('status', 'active').gt('end_at', new Date().toISOString())
    .eq('image_reports.status', 'published')
    .order('created_at', { referencedTable: 'image_reports', ascending: false })
    .limit(20, { referencedTable: 'image_reports' })
    .order('start_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []).map((row) => ({ ...cloudEventRecord(row), imagePaths: eventReportImagePaths(row.image_reports, row.id) }))
}

export function informationDraftForUser(seed, viewerId) {
  if (!seed?.draft) return undefined
  if (seed.userId === (viewerId ?? null)) return seed.draft
  if (seed.userId === null && !seed.draft.sourceMessageId && !seed.draft.details?.image_paths?.length) return seed.draft
  return undefined
}
