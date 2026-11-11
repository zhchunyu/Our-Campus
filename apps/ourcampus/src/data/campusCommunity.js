import { normalizePostImagePaths, safePostImagePaths } from './postImages.js'
import { CAMPUS_HALL_REGIONS } from './campusHall.js'

export const COMMUNITY_STORAGE_KEY = 'campus-twin-community-v1'
export const LOCAL_AUTHOR_ID = 'local-device'
export const MAX_LOCAL_POSTS = 20
const regionIds = new Set(CAMPUS_HALL_REGIONS.filter((region) => region.id !== 'all').map((region) => region.id))

export function getCampusRegionId(location) {
  if (!location) return null
  if (location.category === 'transport') return 'gate'
  if (location.category === 'learning') return 'teaching'
  if (location.category === 'living' && /公寓|宿舍/.test(location.name)) return 'dorm'
  if (/体育|运动|球类|球场|篮球|网球|游泳|文体/.test(location.name)) return 'sports'
  return 'living'
}

export function getRegionLabel(id) {
  return CAMPUS_HALL_REGIONS.find((region) => region.id === id)?.label ?? '校园'
}

export function makeCommunityId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

export function isLocalPhoto(value) {
  return typeof value === 'string' && (value === '' || (value.length <= 180000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)))
}

export function createLostFoundPost(input, locations, previous = null, now = new Date()) {
  if (previous && previous.authorId !== LOCAL_AUTHOR_ID) throw new Error('只能编辑当前设备发布的信息')
  const title = String(input.title ?? '').trim()
  const description = String(input.description ?? '').trim()
  const contact = String(input.contact ?? '').trim()
  const locationDetail = String(input.locationDetail ?? '').trim()
  const location = locations.find((item) => item.id === input.locationId)
  if (!['lost', 'found'].includes(input.type)) throw new Error('请选择寻物或招领')
  if (!title || title.length > 40) throw new Error('物品名称请填写 1–40 个字')
  if (!description || description.length > 300) throw new Error('请填写物品特征，最多 300 个字')
  if (!contact || contact.length > 80) throw new Error('请填写联系方式，最多 80 个字')
  if (!location || locationDetail.length > 100) throw new Error('请选择校园地点，具体位置最多 100 个字')
  const occurredAt = new Date(input.occurredAt)
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + 60000) throw new Error('请填写有效的丢失或拾获时间，不能晚于现在')
  if (!isLocalPhoto(input.image ?? '')) throw new Error('照片无效或过大，请重新选择')
  return {
    id: previous?.id ?? makeCommunityId('lost-found'), authorId: LOCAL_AUTHOR_ID,
    type: input.type, title, description, contact, locationDetail, locationId: location.id,
    regionId: getCampusRegionId(location), occurredAt: occurredAt.toISOString(), image: input.image ?? '',
    status: previous?.status ?? 'active', createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
  }
}

// A cloud record carries private object references, never a persisted signed URL.
export function cloudLostFoundPost(report, locations, localPosts = []) {
  if (!['lost', 'found'].includes(report?.kind) || ['withdrawn', 'rejected'].includes(report.status)) return null
  const imagePaths = safePostImagePaths(report.details?.image_paths)
  const oldPhoto = localPosts.find((post) => post.cloudReportId === report.id)?.image || ''
  return {
    id: report.id, cloudReportId: report.id, isCloud: true, authorId: report.author_id, type: report.kind,
    title: report.details?.item_name || report.title, description: report.body, contact: report.details?.contact || '',
    locationId: report.location_id, locationDetail: report.details?.location_detail || '',
    regionId: getCampusRegionId(locations.find((location) => location.id === report.location_id)),
    occurredAt: report.details?.occurred_at || report.created_at, createdAt: report.created_at, updatedAt: report.updated_at,
    status: report.status === 'resolved' ? 'resolved' : 'active', imagePaths,
    image: imagePaths.length ? '' : isLocalPhoto(oldPhoto) ? oldPhoto : '',
  }
}
export function lostFoundReportDetails(post, imagePaths = [], ownerId) {
  const paths = normalizePostImagePaths(imagePaths, ownerId)
  return { item_name: post.title, contact: post.contact, location_detail: post.locationDetail,
    occurred_at: post.occurredAt, ...(paths.length ? { image_paths: paths } : {}) }
}

export function isSavedLostFoundPost(post) {
  return post && typeof post.id === 'string' && post.authorId === LOCAL_AUTHOR_ID
    && ['lost', 'found'].includes(post.type) && ['active', 'resolved'].includes(post.status)
    && regionIds.has(post.regionId) && typeof post.locationId === 'string'
    && ['title', 'description', 'contact', 'locationDetail'].every((field) => typeof post[field] === 'string')
    && post.title.trim().length > 0 && post.title.length <= 40 && post.description.trim().length > 0 && post.description.length <= 300
    && post.contact.trim().length > 0 && post.contact.length <= 80 && post.locationDetail.length <= 100
    && ['createdAt', 'updatedAt', 'occurredAt'].every((field) => typeof post[field] === 'string' && Number.isFinite(Date.parse(post[field])))
    && isLocalPhoto(post.image)
}

export function filterLostFoundPosts(posts, { regionId = 'all', type = 'all', status = 'active', query = '', authorId = LOCAL_AUTHOR_ID } = {}) {
  const term = query.trim().toLowerCase()
  return posts.filter((post) => (regionId === 'all' || post.regionId === regionId)
    && (type === 'all' || (type === 'mine' ? post.authorId === LOCAL_AUTHOR_ID || post.authorId === authorId : post.type === type))
    && (status === 'all' || post.status === status)
    && [post.title, post.description, post.locationDetail].join(' ').toLowerCase().includes(term))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function updateLostFoundStatus(posts, id, status) {
  if (!['active', 'resolved'].includes(status)) throw new Error('无效的失物状态')
  const post = posts.find((item) => item.id === id)
  if (!post || post.authorId !== LOCAL_AUTHOR_ID) throw new Error('只能更新当前设备发布的信息')
  return posts.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item)
}

export function createDemoLostFoundPosts() {
  const now = new Date().toISOString()
  return [
    { id: 'demo-lost-umbrella', type: 'lost', title: '深蓝色折叠伞', locationId: 'library', regionId: 'teaching', description: '示例：伞柄带一根灰色挂绳。可发布照片和特征，方便同学辨认。', locationDetail: '图书馆附近（示例）' },
    { id: 'demo-found-keys', type: 'found', title: '一串钥匙', locationId: 'canteen', regionId: 'living', description: '示例：拾获物品可以关联校园地点，认领完成后由发布者更新状态。', locationDetail: '谷园餐厅附近（示例）' },
  ].map((post) => ({ ...post, authorId: 'demo', status: 'active', createdAt: now, occurredAt: now, updatedAt: now, image: '', isDemo: true, contact: '示例信息，没有真实联系人。' }))
}

function getStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

export function loadCommunityState(storage = getStorage()) {
  try {
    const raw = JSON.parse(storage?.getItem(COMMUNITY_STORAGE_KEY) ?? 'null')
    if (raw?.schemaVersion !== 1) return { posts: [], facilities: [] }
    return {
      posts: Array.isArray(raw?.posts) ? raw.posts.filter(isSavedLostFoundPost).slice(0, MAX_LOCAL_POSTS) : [],
      facilities: Array.isArray(raw?.facilities) ? raw.facilities.filter(isSavedFacility).slice(0, 100) : [],
    }
  } catch { return { posts: [], facilities: [] } }
}

export function saveCommunityState(state, storage = getStorage()) {
  if (!storage) throw new Error('当前设备无法保存数据，请检查浏览器存储权限')
  if (state.posts.length > MAX_LOCAL_POSTS) throw new Error(`本机最多保存 ${MAX_LOCAL_POSTS} 条，请先删除不再需要的发布`)
  if (state.facilities.length > 100) throw new Error('本机设施记录已满')
  if (!state.posts.every(isSavedLostFoundPost) || !state.facilities.every(isSavedFacility)) throw new Error('数据格式无效，未保存')
  try { storage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, ...state })) }
  catch { throw new Error('本机存储空间不足，草稿已保留，请移除照片后重试') }
}

export const FACILITY_TYPES = [
  { id: 'food', label: '餐饮' }, { id: 'medical', label: '校医' }, { id: 'sports', label: '运动' },
  { id: 'toilet', label: '卫生间' }, { id: 'water', label: '饮水点' },
  { id: 'print', label: '打印' }, { id: 'parcel', label: '快递' }, { id: 'bike', label: '自行车服务' },
]

export function isSavedFacility(record) {
  return record && typeof record.id === 'string' && record.authorId === LOCAL_AUTHOR_ID
    && FACILITY_TYPES.some((type) => type.id === record.type)
    && ['pending', 'verified', 'rejected'].includes(record.status)
    && typeof record.locationId === 'string' && typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 40
    && typeof record.detail === 'string' && record.detail.trim().length > 0 && record.detail.length <= 120
    && ['createdAt', 'updatedAt'].every((field) => typeof record[field] === 'string' && Number.isFinite(Date.parse(record[field])))
}

export function createFacilityContribution(input, locations, now = new Date()) {
  const name = String(input.name ?? '').trim()
  const detail = String(input.detail ?? '').trim()
  if (!FACILITY_TYPES.some((type) => type.id === input.type)) throw new Error('请选择设施类型')
  if (!name || name.length > 40) throw new Error('设施名称请填写 1–40 个字')
  if (!detail || detail.length > 120) throw new Error('请填写楼层、位置或服务说明，最多 120 个字')
  if (!locations.some((location) => location.id === input.locationId)) throw new Error('请选择所属校园地点')
  return { id: makeCommunityId('facility'), authorId: LOCAL_AUTHOR_ID, type: input.type, name, detail, locationId: input.locationId, status: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString() }
}

export function reviewFacilityContribution(records, id, status, role) {
  if (role !== 'manager') throw new Error('请切换到管理者演示角色确认设施')
  if (!['verified', 'rejected'].includes(status) || !records.some((item) => item.id === id && item.status === 'pending')) throw new Error('这条记录已处理或不存在')
  return records.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item)
}
