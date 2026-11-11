const STORAGE_PREFIX = 'ourcampus.personal-home.v1.'
const IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i
const THEMES = new Set(['forest', 'coral', 'sunny', 'lavender'])
export const DEFAULT_PERSONAL_ARTWORK = '/assets/personal-space/sunflower-cat-cover.png'

export const EMPTY_PERSONAL_HOME = Object.freeze({
  avatar: '',
  cover: '',
  coverX: 50,
  coverY: 50,
  bio: '',
  tags: [],
  theme: 'forest',
  motion: false,
})

function safeImage(value) {
  return typeof value === 'string' && value.length < 900_000 && IMAGE_PATTERN.test(value) ? value : ''
}

function safeFocus(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 50
}

function browserStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

export function normalizePersonalHome(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_PERSONAL_HOME, tags: [] }
  return {
    avatar: safeImage(value.avatar),
    cover: safeImage(value.cover),
    coverX: safeFocus(value.coverX),
    coverY: safeFocus(value.coverY),
    bio: typeof value.bio === 'string' ? [...value.bio.trim()].slice(0, 40).join('') : '',
    tags: Array.isArray(value.tags) ? [...new Set(value.tags.filter((tag) => typeof tag === 'string').map((tag) => [...tag.trim()].slice(0, 8).join('')).filter(Boolean))].slice(0, 3) : [],
    theme: THEMES.has(value.theme) ? value.theme : 'forest',
    motion: value.motion === true,
  }
}

export function loadPersonalHome(userId, storage = browserStorage()) {
  if (!userId || !storage) return normalizePersonalHome(null)
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${userId}`)
    return normalizePersonalHome(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizePersonalHome(null)
  }
}

export function savePersonalHome(userId, value, storage = browserStorage()) {
  if (!userId || !storage) throw new Error('请先登录后保存主页')
  const next = normalizePersonalHome(value)
  storage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next))
  return next
}

export async function resizePersonalImage(file, maxSize) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  if (file.size > 12 * 1024 * 1024) throw new Error('图片不能超过 12 MB')

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    try { await img.decode() } catch { throw new Error('图片无法读取，请换一张图片') }
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('此设备暂时无法处理图片')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', 0.78)
    if (image.length >= 900_000) throw new Error('图片保存空间不足，请换一张较简单的图片')
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
