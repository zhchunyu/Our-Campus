import { GUYUAN_WINDOWS } from './guyuanWindows.js'

const STORAGE_KEY = 'campus-twin-restaurant-reviews-v1'
export const REVIEW_TAGS = ['口味好', '分量足', '性价比高', '出餐快', '排队久', '偏油', '偏咸']
export const WINDOW_CATEGORIES = ['全部', '面食', '米饭', '轻食', '小吃', '饮品', '其他']

const WINDOW_TEMPLATES = [
  { id: 'window-01', number: '01', name: '特色面食', category: '面食', icon: 'noodles', tone: 'wheat', description: '一碗热乎的，看看同学推荐什么。', dish: '招牌面 · 示例' },
  { id: 'window-02', number: '02', name: '家常小炒', category: '米饭', icon: 'rice', tone: 'green', description: '日常吃饭的选择，口味和分量都聊聊。', dish: '双拼盖饭 · 示例' },
  { id: 'window-03', number: '03', name: '轻食沙拉', category: '轻食', icon: 'salad', tone: 'sage', description: '想吃清爽一点，看看搭配和性价比。', dish: '轻食套餐 · 示例' },
  { id: 'window-04', number: '04', name: '粉面小馆', category: '面食', icon: 'noodles', tone: 'peach', description: '汤底、辣度和配料，交给同学点评。', dish: '汤粉套餐 · 示例' },
  { id: 'window-05', number: '05', name: '风味小吃', category: '小吃', icon: 'snack', tone: 'sand', description: '加餐或解馋，分享你吃过的那一口。', dish: '小吃拼盘 · 示例' },
  { id: 'window-06', number: '06', name: '自选套餐', category: '米饭', icon: 'rice', tone: 'rose', description: '想配什么自己选，看看大家的体验。', dish: '自选饭菜 · 示例' },
]
const EXAMPLE_COMMENTS = [
  [5, '面条口感不错，分量也挺足。喜欢清淡的可以少放一点调料。', ['口味好', '分量足'], 12],
  [3, '饭点排队有点久，赶时间的话建议早点来。', ['排队久'], 10],
  [4, '饭菜搭配比较方便，今天这份很合我的口味。', ['口味好'], 13],
  [5, '出餐快，份量对我来说刚好，日常吃饭挺省心。', ['出餐快', '性价比高'], 12],
  [4, '搭配挺清爽，希望以后可以多一些选择。', ['口味好'], 15],
  [3, '味道还行，但这个价位感觉可以再多一点分量。', [], 16],
  [5, '汤底不错，热乎乎的一碗很适合当午饭。', ['口味好', '分量足'], 11],
  [4, '出餐比较快，辣度可以自己选，挺方便的。', ['出餐快'], 12],
  [4, '偶尔换个口味可以，和同学一起点着吃不错。', ['口味好'], 9],
  [5, '加餐的好选择，份量和价格都比较友好。', ['性价比高'], 8],
  [3, '今天吃的这份有点偏咸，希望调味可以轻一点。', ['偏咸'], 12],
  [4, '选菜方便，米饭也足，希望高峰期出餐再快一点。', ['分量足', '排队久'], 13],
]

export function isRestaurantLocation(location) {
  return location?.category === 'dining' && /餐厅|食堂/.test(location.name ?? '')
}

export function getRestaurantWindows(restaurantId) {
  if (restaurantId === 'canteen') return GUYUAN_WINDOWS.map((window) => ({ ...window }))
  return WINDOW_TEMPLATES.map((window) => ({ ...window, isExample: true }))
}

export function getExampleWindowReviews(restaurantId) {
  return EXAMPLE_COMMENTS.map(([rating, content, tags, price], index) => ({
    id: `example:${restaurantId}:${index}`,
    restaurantId,
    windowId: WINDOW_TEMPLATES[Math.floor(index / 2)].id,
    author: ['饭点同学', '校园吃饭人', '小麦', '今天吃什么'][index % 4],
    rating, content, tags, price,
    createdAt: '2026-10-01T12:00:00+08:00',
    isExample: true,
  }))
}

export function summarizeReviews(reviews) {
  if (!reviews.length) return { count: 0, rating: null, price: null, recommended: 0 }
  const prices = reviews.map((review) => review.price).filter((price) => price !== null && Number.isFinite(price))
  return {
    count: reviews.length,
    rating: (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1),
    price: prices.length ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null,
    recommended: Math.round(reviews.filter((review) => review.rating >= 4).length / reviews.length * 100),
  }
}

function isValidLocalReview(review) {
  return review && typeof review.id === 'string' && review.id.length >= 1 && review.id.length <= 100
    && typeof review.restaurantId === 'string' && review.restaurantId.length >= 1 && review.restaurantId.length <= 100
    && typeof review.windowId === 'string' && review.windowId.length >= 1 && review.windowId.length <= 100
    && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5
    && typeof review.author === 'string' && [...review.author].length >= 1 && [...review.author].length <= 40
    && typeof review.content === 'string' && [...review.content.trim()].length >= 1 && [...review.content].length <= 300
    && Array.isArray(review.tags) && review.tags.length <= 3 && review.tags.every((tag) => REVIEW_TAGS.includes(tag))
    && (review.price === null || (Number.isFinite(review.price) && review.price >= 0 && review.price <= 200))
    && typeof review.createdAt === 'string' && Number.isFinite(Date.parse(review.createdAt))
    && review.isExample === false
}

export function loadLocalRestaurantReviews() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw || raw.length > 500_000) return []
    const saved = JSON.parse(raw)
    if (saved?.version !== 1 || !Array.isArray(saved.reviews)) return []
    return saved.reviews.filter(isValidLocalReview).slice(0, 200)
  } catch { return [] }
}

export function createLocalRestaurantReview(input) {
  const content = String(input.content ?? '').trim()
  const price = String(input.price ?? '').trim() === '' ? null : Number(input.price)
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('先为这个窗口选一个星级吧')
  if (!content || [...content].length > 300) throw new Error('请写下 1–300 字的用餐体验')
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 200)) throw new Error('消费金额请填写 0–200 元，或留空')
  const review = {
    id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    restaurantId: input.restaurantId, windowId: input.windowId,
    author: [...String(input.author || '我').trim()].slice(0, 40).join('') || '我',
    rating: input.rating, content,
    tags: [...new Set(input.tags ?? [])].slice(0, 3),
    price: price === null ? null : Math.round(price * 100) / 100,
    createdAt: new Date().toISOString(), isExample: false,
  }
  if (!isValidLocalReview(review)) throw new Error('评价内容不完整，请检查后重试')
  return review
}

export function saveLocalRestaurantReviews(reviews) {
  if (reviews.length > 200) throw new Error('本机评价已达 200 条，请先移除不需要的评价')
  try {
    if (!globalThis.localStorage) throw new Error('storage unavailable')
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, reviews }))
  } catch { throw new Error('本机保存失败，请检查浏览器存储空间后重试') }
}
