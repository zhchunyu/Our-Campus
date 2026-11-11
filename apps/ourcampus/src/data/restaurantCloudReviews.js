import { requireSupabase } from './supabaseClient.js'
import { informationError } from './campusInformation.js'

export function reviewServerError(error) {
  if (error?.code === '23505') return '你已评价这个窗口，请先撤回原评价，再发布新的用餐体验。'
  return ['PGRST202', 'PGRST205', '42P01'].includes(error?.code) ? '多人评价服务尚未部署，请队友执行 11 号餐厅评价 SQL。' : informationError(error)
}
export const mapCloudReview = (r) => ({ id: r.id, windowId: r.window_id, restaurantId: r.restaurant_id,
  authorId: r.author_id, author: r.author_name, rating: r.rating, content: r.content, tags: r.tags,
  price: r.price === null ? null : Number(r.price), createdAt: r.created_at, isExample: false, isCloud: true })
export async function loadReviewSummary(restaurantId) {
  const { data, error } = await requireSupabase().from('restaurant_review_stats').select('*').eq('restaurant_id', restaurantId)
  if (error) throw error
  return data.map((r) => ({ windowId: r.window_id, count: Number(r.count), ratingSum: Number(r.rating_sum), rating: r.rating === null ? null : Number(r.rating).toFixed(1), price: r.price === null ? null : Number(r.price), recommended: Number(r.recommended) }))
}
export async function loadUserCloudReviews(userId) {
  if (!userId) return []
  const { data, error } = await requireSupabase().from('restaurant_reviews').select('*')
    .eq('author_id', userId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data.map((review) => ({ ...mapCloudReview(review), status: review.status }))
}
export async function loadWindowCloudReviews(windowId, before = null) {
  let query = requireSupabase().from('restaurant_reviews').select('*').eq('window_id', windowId).eq('status', 'visible')
  if (before) query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`)
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
  if (error) throw error
  return data.map(mapCloudReview)
}
export async function submitWindowCloudReview(draft) {
  const { data, error } = await requireSupabase().rpc('campus_submit_restaurant_review', { p_client_id: draft.clientId,
    p_window_id: draft.windowId, p_restaurant_id: draft.restaurantId, p_rating: draft.rating, p_content: draft.content,
    p_tags: draft.tags, p_price: draft.price })
  if (error) throw error
  return data
}
export async function withdrawWindowCloudReview(id) {
  const { error } = await requireSupabase().rpc('campus_withdraw_restaurant_review', { p_id: id })
  if (error) throw error
}
