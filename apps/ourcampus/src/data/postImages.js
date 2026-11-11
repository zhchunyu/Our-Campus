import { requireSupabase } from './supabaseClient.js'
export const POST_IMAGE_LIMIT = 3
export const POST_IMAGE_BUCKET = 'post-images'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OWNER = new RegExp(`^${UUID}$`)
const PATH = new RegExp(`^(${UUID})/${UUID}\\.jpg$`)
export function normalizePostImagePaths(paths = [], ownerId) {
  if (!Array.isArray(paths) || paths.length > POST_IMAGE_LIMIT || new Set(paths).size !== paths.length) throw new Error('每条信息最多添加 3 张不同的照片')
  if (paths.some((path) => typeof path !== 'string' || !PATH.test(path) || (ownerId && !path.startsWith(`${ownerId}/`)))) throw new Error('照片引用无效，请重新选择')
  return [...paths]
}
export function safePostImagePaths(paths) { try { return normalizePostImagePaths(paths) } catch { return [] } }
export function validatePostImageFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('单张原图不能超过 10 MB')
}
export async function preparePostImage(file) {
  validatePostImageFile(file)
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('照片无法读取，请重新选择')
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备无法处理照片')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78))
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('照片处理失败，请选择较小的照片')
    return { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) }
  } finally { URL.revokeObjectURL(source) }
}
export function createPostImageUploadSession() {
  const uploaded = new Map()
  return { async upload(ownerId, items, isCurrent = () => true) {
    if (!OWNER.test(ownerId)) throw new Error('请先登录后上传照片')
    if (!Array.isArray(items) || items.length > POST_IMAGE_LIMIT) throw new Error('每条信息最多添加 3 张照片')
    const paths = normalizePostImagePaths(items.map((item) => `${ownerId}/${item.id}.jpg`), ownerId)
    const storage = requireSupabase().storage.from(POST_IMAGE_BUCKET)
    for (let index = 0; index < items.length; index += 1) {
      if (!isCurrent()) throw new Error('账号或草稿已变化，请重新发布')
      const path = paths[index]
      if (uploaded.has(path)) continue
      const { error } = await storage.upload(path, items[index].blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '300' })
      if (error) {
        // A timed-out upload may already have committed. A retry uses the exact
        // same object name; only accept a conflict after authenticated read proves it exists.
        const status = String(error.statusCode ?? error.status)
        const duplicate = status === '409' || (status === '400' && /already exists|duplicate|resourcealreadyexists/i.test(`${error.message || ''} ${error.error || ''} ${error.code || ''}`))
        if (!duplicate) throw new Error('照片上传未完成，请检查网络后重试')
        const checked = await storage.createSignedUrls([path], 30)
        if (checked.error || !checked.data?.[0]?.signedUrl || checked.data[0].error) throw new Error('照片上传未完成，请重试')
      }
      uploaded.set(path, true)
      if (!isCurrent()) throw new Error('账号或草稿已变化，请重新发布')
    }
    return paths
  } }
}
export async function signPostImages(paths) {
  const valid = normalizePostImagePaths(paths)
  if (!valid.length) return []
  const { data, error } = await requireSupabase().storage.from(POST_IMAGE_BUCKET).createSignedUrls(valid, 300)
  if (error) throw new Error('照片暂时无法读取，请重试')
  return valid.map((path) => {
    const item = data?.find((entry) => entry.path === path)
    if (item?.error || !item?.signedUrl) throw new Error('照片已不可用，或你没有查看权限')
    const url = new URL(item.signedUrl)
    if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith(`/storage/v1/object/sign/${POST_IMAGE_BUCKET}/${path}`)) throw new Error('照片地址无效')
    return { path, url: url.href }
  })
}
